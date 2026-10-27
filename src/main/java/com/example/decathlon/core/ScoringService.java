package com.example.decathlon.core;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ScoringService {
    public enum Type { TRACK, FIELD }

    /** One event: IAAF constants, the input unit and the accepted input range (in that unit). */
    public record EventDef(String id, String label, Competition competition, Type type,
                           double A, double B, double C, String unit, double min, double max) {}

    private final Map<String, EventDef> events = new LinkedHashMap<>();

    public ScoringService() {
        Competition dec = Competition.DECATHLON;
        track("100m", "100m", dec, 25.4347, 18.0, 1.81, 5, 17.8);
        track("110mHurdles", "110m Hurdles", dec, 5.74352, 28.5, 1.92, 10, 28.5);
        track("400m", "400m", dec, 1.53775, 82.0, 1.81, 20, 100);
        track("1500m", "1500m", dec, 0.03768, 480.0, 1.85, 150, 600);
        field("longJump", "Long Jump", dec, 0.14354, 220.0, 1.4, "cm", 0, 1000);
        field("highJump", "High Jump", dec, 0.8465, 75.0, 1.42, "cm", 0, 250);
        field("poleVault", "Pole Vault", dec, 0.2797, 100.0, 1.35, "cm", 0, 650);
        field("shotPut", "Shot Put", dec, 51.39, 1.5, 1.05, "m", 0, 30);
        field("discusThrow", "Discus Throw", dec, 12.91, 4.0, 1.1, "m", 0, 85);
        field("javelinThrow", "Javelin Throw", dec, 10.14, 7.0, 1.08, "m", 0, 110);

        Competition hep = Competition.HEPTATHLON;
        track("hep100mHurdles", "100m Hurdles", hep, 9.23076, 26.7, 1.835, 10, 30);
        track("hep200m", "200m", hep, 4.99087, 42.5, 1.81, 15, 40);
        track("hep800m", "800m", hep, 0.11193, 254.0, 1.88, 90, 300);
        field("hepLongJump", "Long Jump", hep, 0.188807, 210.0, 1.41, "cm", 0, 1000);
        field("hepHighJump", "High Jump", hep, 1.84523, 75.0, 1.348, "cm", 0, 250);
        field("hepShotPut", "Shot Put", hep, 56.0211, 1.5, 1.05, "m", 0, 30);
        field("hepJavelinThrow", "Javelin Throw", hep, 15.9803, 3.8, 1.04, "m", 0, 80);
    }

    private void track(String id, String label, Competition competition,
                       double a, double b, double c, double min, double max) {
        events.put(id, new EventDef(id, label, competition, Type.TRACK, a, b, c, "s", min, max));
    }

    private void field(String id, String label, Competition competition,
                       double a, double b, double c, String unit, double min, double max) {
        events.put(id, new EventDef(id, label, competition, Type.FIELD, a, b, c, unit, min, max));
    }

    public EventDef get(String id) { return events.get(id); }

    /** Every event, decathlon first, in display order. */
    public List<EventDef> events() { return new ArrayList<>(events.values()); }

    public List<EventDef> eventsFor(Competition competition) {
        List<EventDef> list = new ArrayList<>();
        for (EventDef e : events.values()) {
            if (e.competition() == competition) list.add(e);
        }
        return list;
    }

    /**
     * Checks an event id and a raw result before scoring.
     * Throws CoreException(INVALID) with a readable message if anything is wrong.
     */
    public EventDef validate(String eventId, Double raw) {
        if (eventId == null) throw invalid("Event is required");
        EventDef e = events.get(eventId);
        if (e == null) throw invalid("Unknown event: " + eventId);
        if (raw == null) throw invalid("Result is required");
        if (raw.isNaN() || raw.isInfinite()) throw invalid("Result must be a number");
        if (raw < e.min()) {
            throw invalid("Result too low for " + e.label() + ": minimum is " + plain(e.min()) + " " + e.unit());
        }
        if (raw > e.max()) {
            throw invalid("Result too high for " + e.label() + ": maximum is " + plain(e.max()) + " " + e.unit());
        }
        return e;
    }

    public int score(String eventId, Double raw) {
        EventDef e = validate(eventId, raw);
        double x = e.type() == Type.TRACK ? e.B() - raw : raw - e.B();
        if (x <= 0) return 0;
        return (int) Math.floor(e.A() * Math.pow(x, e.C()));
    }

    private static CoreException invalid(String message) {
        return new CoreException(CoreException.Kind.INVALID, message);
    }

    private static String plain(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }
}
