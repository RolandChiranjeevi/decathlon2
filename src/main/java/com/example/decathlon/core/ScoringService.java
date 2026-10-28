package com.example.decathlon.core;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class ScoringService {
    public enum Type { TRACK, FIELD }

    /**
     * One event: IAAF constants, the input unit and the accepted input limits (in that unit), which are
     * the current world records. A running event only has a minimum (a faster time is rejected; any
     * slower time is valid and scores 0 below the formula's cutoff). A jumping or throwing event only has
     * a maximum, and anything from 0 up to it is valid.
     * A limit that does not apply is null.
     * The record holder and year let a page ask "Can you {action} {holder} did in {year}?",
     * where the action is for example "run faster than" or "jump further than".
     */
    public record EventDef(String id, String label, Competition competition, Type type,
                           double A, double B, double C, String unit, Double min, Double max,
                           String holder, int year, String action) {
        /** True for timed events whose normal results pass a minute (400m, 800m, 1500m), so m:ss is a useful way to enter them. */
        public boolean minutes() { return type == Type.TRACK && B >= 60; }
    }

    private final Map<String, EventDef> events = new LinkedHashMap<>();

    public ScoringService() {
        Competition dec = Competition.DECATHLON;
        // Running: the last number is the fastest accepted time, the current world record (men's for the
        // decathlon, women's for the heptathlon; checked October 2026). Slower times are always accepted.
        // Update a value here when a record is broken.
        // Jumping and throwing: the last number is the current world record, the furthest accepted result.
        // Anything from 0 up to it is accepted.
        track("100m", "100m", dec, 25.4347, 18.0, 1.81, 9.58, "Usain Bolt", 2009);
        track("110mHurdles", "110m Hurdles", dec, 5.74352, 28.5, 1.92, 12.75, "Ja'Kobe Tharp", 2026);
        track("400m", "400m", dec, 1.53775, 82.0, 1.81, 43.03, "Wayde van Niekerk", 2016);
        track("1500m", "1500m", dec, 0.03768, 480.0, 1.85, 206.0, "Hicham El Guerrouj", 1998);   // 3:26.00
        field("longJump", "Long Jump", dec, 0.14354, 220.0, 1.4, "cm", 895, "Mike Powell", 1991, FURTHER_JUMP);
        field("highJump", "High Jump", dec, 0.8465, 75.0, 1.42, "cm", 245, "Javier Sotomayor", 1993, HIGHER_JUMP);
        field("poleVault", "Pole Vault", dec, 0.2797, 100.0, 1.35, "cm", 631, "Armand Duplantis", 2026, HIGHER_JUMP);
        field("shotPut", "Shot Put", dec, 51.39, 1.5, 1.05, "m", 23.56, "Ryan Crouser", 2023, FURTHER_THROW);
        field("discusThrow", "Discus Throw", dec, 12.91, 4.0, 1.1, "m", 75.56, "Mykolas Alekna", 2025, FURTHER_THROW);
        field("javelinThrow", "Javelin Throw", dec, 10.14, 7.0, 1.08, "m", 98.48, "Jan Železný", 1996, FURTHER_THROW);

        Competition hep = Competition.HEPTATHLON;
        track("hep100mHurdles", "100m Hurdles", hep, 9.23076, 26.7, 1.835, 12.09, "Masai Russell", 2026);
        track("hep200m", "200m", hep, 4.99087, 42.5, 1.81, 21.34, "Florence Griffith Joyner", 1988);
        track("hep800m", "800m", hep, 0.11193, 254.0, 1.88, 113.28, "Jarmila Kratochvílová", 1983);   // 1:53.28
        field("hepLongJump", "Long Jump", hep, 0.188807, 210.0, 1.41, "cm", 752, "Galina Chistyakova", 1988, FURTHER_JUMP);
        field("hepHighJump", "High Jump", hep, 1.84523, 75.0, 1.348, "cm", 210, "Yaroslava Mahuchikh", 2024, HIGHER_JUMP);
        field("hepShotPut", "Shot Put", hep, 56.0211, 1.5, 1.05, "m", 22.63, "Natalya Lisovskaya", 1987, FURTHER_THROW);
        field("hepJavelinThrow", "Javelin Throw", hep, 15.9803, 3.8, 1.04, "m", 72.28, "Barbora Špotáková", 2008, FURTHER_THROW);
    }

    private static final String FASTER_RUN = "run faster than";
    private static final String FURTHER_JUMP = "jump further than";
    private static final String HIGHER_JUMP = "jump higher than";
    private static final String FURTHER_THROW = "throw further than";

    private void track(String id, String label, Competition competition,
                       double a, double b, double c, double min, String holder, int year) {
        events.put(id, new EventDef(id, label, competition, Type.TRACK, a, b, c, "s", min, null,
                holder, year, FASTER_RUN));
    }

    private void field(String id, String label, Competition competition,
                       double a, double b, double c, String unit, double max, String holder, int year, String action) {
        events.put(id, new EventDef(id, label, competition, Type.FIELD, a, b, c, unit, null, max,
                holder, year, action));
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
        if (raw < 0) throw invalid("Result cannot be negative");
        if (e.min() != null && raw < e.min()) {
            throw invalid("Faster than the world record for " + e.label() + ": " + limitText(e, e.min()));
        }
        if (e.max() != null && raw > e.max()) {
            throw invalid("Beyond the world record for " + e.label() + ": " + limitText(e, e.max()));
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

    /** "9.58 s", "895 cm", or for a long time "3:26.00 (206 s)". */
    private static String limitText(EventDef e, double value) {
        if (!e.minutes() || value < 60) return plain(value) + " " + e.unit();
        int minutes = (int) (value / 60);
        return String.format(Locale.ROOT, "%d:%05.2f", minutes, value - minutes * 60) + " (" + plain(value) + " s)";
    }

    private static String plain(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }
}
