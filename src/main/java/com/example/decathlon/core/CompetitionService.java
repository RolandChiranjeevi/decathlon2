package com.example.decathlon.core;

import com.example.decathlon.core.ScoringService.EventDef;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

public class CompetitionService {
    public static final int MAX_COMPETITORS = 40;
    private static final int STATE_VERSION = 1;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private static final Pattern NAME = Pattern.compile("[\\p{L}\\p{N} '.-]+");

    private final ScoringService scoring;
    private final String id;
    private String name;
    private final Competition type;

    /** A mixed competition called "General", which can hold both decathlon and heptathlon competitors. */
    public CompetitionService(ScoringService scoring) {
        this(scoring, "default", "General", null);
    }

    /**
     * One competition. With a type it only takes that competition's events and competitors;
     * with a null type (mixed) each competitor is fixed to one competition by their first result.
     */
    public CompetitionService(ScoringService scoring, String id, String name, Competition type) {
        this.scoring = scoring;
        this.id = id;
        this.name = name;
        this.type = type;
    }

    public String id() { return id; }

    public synchronized String name() { return name; }

    /** Package-private: the registry checks the name is valid and unique before calling this. */
    synchronized void setName(String name) { this.name = name; }

    /** The competition this holds, or null if it is mixed. */
    public Competition type() { return type; }

    public synchronized int competitorCount() { return competitors.size(); }

    /** One stored result: the raw result as entered and the points it scored. */
    public record Result(Double raw, int points) {}

    public static class Competitor {
        private String name;
        private Competition competition;
        private final Map<String, Result> results = new LinkedHashMap<>();

        Competitor(String name) {
            this.name = name;
        }

        public String name() { return name; }

        /** Null until the competitor has a result or was added with a competition. */
        public Competition competition() { return competition; }

        public int total() {
            return results.values().stream().mapToInt(Result::points).sum();
        }
    }

    private final Map<String, Competitor> competitors = new LinkedHashMap<>();

    /** Returns the trimmed name, or throws CoreException(INVALID) if it has no letter or holds other characters. */
    public static String validateName(String name) {
        String n = name == null ? "" : name.trim();
        if (!NAME.matcher(n).matches() || n.codePoints().noneMatch(Character::isLetter)) {
            throw new CoreException(CoreException.Kind.INVALID, "Name must contain valid letters");
        }
        return n;
    }

    /** Adds a competitor. Adding an existing name does nothing. The competition is fixed by the first result. */
    public synchronized void addCompetitor(String name) {
        register(name);
    }

    /** Adds a competitor for a given competition. Fails if an existing competitor already competes in the other one. */
    public synchronized void addCompetitor(String name, Competition competition) {
        requireType(competition);
        assign(register(name), competition);
    }

    /**
     * Scores a result for an existing competitor. A second result for the same event replaces the first.
     * A competitor cannot mix decathlon and heptathlon events, and a typed competition only takes its own events.
     */
    public synchronized int score(String name, String eventId, Double raw) {
        EventDef event = scoring.validate(eventId, raw);
        requireType(event.competition());
        int pts = scoring.score(eventId, raw);
        Competitor c = find(name);
        assign(c, event.competition());
        c.results.put(eventId, new Result(raw, pts));
        return pts;
    }

    /**
     * Renames a competitor, keeping their results and their place in the list.
     * The new name follows the same rules as any name and must not belong to someone else.
     */
    public synchronized void renameCompetitor(String from, String to) {
        Competitor c = find(from);
        String newName = validateName(to);
        if (newName.equals(c.name)) return;
        if (competitors.containsKey(newName)) {
            throw new CoreException(CoreException.Kind.INVALID, "Competitor already exists: " + newName);
        }
        Map<String, Competitor> renamed = new LinkedHashMap<>();
        for (Map.Entry<String, Competitor> entry : competitors.entrySet()) {
            if (entry.getValue() == c) {
                c.name = newName;
                renamed.put(newName, c);
            } else {
                renamed.put(entry.getKey(), entry.getValue());
            }
        }
        competitors.clear();
        competitors.putAll(renamed);
    }

    /** The stored raw result, or null if there is none. */
    public synchronized Double raw(String name, String eventId) {
        Competitor c = competitors.get(name == null ? "" : name.trim());
        Result r = c == null ? null : c.results.get(eventId);
        return r == null ? null : r.raw();
    }

    public synchronized boolean hasResult(String name, String eventId) {
        Competitor c = competitors.get(name == null ? "" : name.trim());
        return c != null && c.results.containsKey(eventId);
    }

    public synchronized int total(String name) {
        Competitor c = competitors.get(name == null ? "" : name.trim());
        return c == null ? 0 : c.total();
    }

    /**
     * Standings, highest total first, ties in the order the competitors were added.
     * Positions are counted within each competition, so decathletes and heptathletes are ranked apart.
     * Tied competitors share a position and the next one skips (1, 2, 2, 4).
     * Competitors with no result yet have no position (null) and are listed last.
     * Each row: name, competition, scores (event to points), raw (event to raw result), total, position.
     */
    public synchronized List<Map<String, Object>> standings() {
        List<Competitor> ranked = new ArrayList<>(competitors.values());
        ranked.sort(Comparator.comparingInt(Competitor::total).reversed());

        // Per competition: {competitors ranked so far, previous total, current position}.
        Map<Competition, int[]> groups = new HashMap<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Competitor c : ranked) {
            int total = c.total();
            Integer position = null;
            if (!c.results.isEmpty()) {
                int[] g = groups.computeIfAbsent(c.competition, k -> new int[3]);
                g[0]++;
                if (g[0] == 1 || total != g[1]) {
                    g[2] = g[0];
                }
                g[1] = total;
                position = g[2];
            }

            Map<String, Integer> points = new LinkedHashMap<>();
            Map<String, Double> raws = new LinkedHashMap<>();
            c.results.forEach((event, r) -> {
                points.put(event, r.points());
                if (r.raw() != null) raws.put(event, r.raw());
            });

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", c.name);
            m.put("competition", c.competition == null ? null : c.competition.name());
            m.put("scores", points);
            m.put("raw", raws);
            m.put("total", total);
            m.put("position", position);
            rows.add(m);
        }
        return rows;
    }

    /**
     * CSV for Excel: a byte-order mark so accents survive, then one row per competitor in standings order:
     * Position, Name, Competition, "&lt;event&gt; result" and "&lt;event&gt; points" for every event anyone has, Total.
     */
    @SuppressWarnings("unchecked")
    public synchronized String exportCsv() {
        List<EventDef> used = scoring.events().stream()
                .filter(e -> competitors.values().stream().anyMatch(c -> c.results.containsKey(e.id())))
                .toList();

        List<String> header = new ArrayList<>(List.of("Position", "Name", "Competition"));
        for (EventDef e : used) {
            header.add(e.id() + " result");
            header.add(e.id() + " points");
        }
        header.add("Total");

        StringBuilder sb = new StringBuilder("﻿");
        sb.append(csvRow(header));
        for (Map<String, Object> row : standings()) {
            Map<String, Integer> points = (Map<String, Integer>) row.get("scores");
            Map<String, Double> raws = (Map<String, Double>) row.get("raw");
            List<String> cells = new ArrayList<>();
            Object competition = row.get("competition");
            cells.add(row.get("position") == null ? "" : String.valueOf(row.get("position")));
            cells.add((String) row.get("name"));
            cells.add(competition == null ? "" : label(Competition.valueOf((String) competition)));
            for (EventDef e : used) {
                Double raw = raws.get(e.id());
                cells.add(raw == null ? "" : plain(raw));
                Integer p = points.get(e.id());
                cells.add(p == null ? "" : String.valueOf(p));
            }
            cells.add(String.valueOf(row.get("total")));
            sb.append(csvRow(cells));
        }
        return sb.toString();
    }

    /** A name like "results-20261027-153045.csv". Two exports within one second get the same name. */
    public static String fileName(String prefix, String extension) {
        return prefix + "-" + LocalDateTime.now().format(STAMP) + "." + extension;
    }

    /** A competition name made safe for a file name: "Göteborg Open 2026" becomes "goteborg-open-2026". */
    public static String slug(String text) {
        String plain = java.text.Normalizer.normalize(text == null ? "" : text, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return plain.isEmpty() ? "competition" : plain;
    }

    /**
     * The whole competition as JSON: competitors, their competition and raw results.
     * Points and positions are not stored; they are worked out again on load.
     */
    public synchronized String exportState() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Competitor c : competitors.values()) {
            Map<String, Double> raws = new LinkedHashMap<>();
            c.results.forEach((event, r) -> raws.put(event, r.raw()));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", c.name);
            m.put("competition", c.competition == null ? null : c.competition.name());
            m.put("results", raws);
            list.add(m);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", STATE_VERSION);
        root.put("name", name);
        root.put("type", type == null ? null : type.name());
        root.put("competitors", list);
        try {
            return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not write state", e);
        }
    }

    /**
     * Replaces the current competition with a saved one. The saved text is checked in full first
     * (version, names, limit, events, ranges); on any problem an INVALID CoreException is thrown
     * and the current state is left exactly as it was.
     */
    public synchronized void importState(String json) {
        Map<String, Competitor> loaded;
        try {
            loaded = parseState(json);
        } catch (CoreException e) {
            throw new CoreException(CoreException.Kind.INVALID, "Invalid saved state: " + e.getMessage());
        } catch (JsonProcessingException | RuntimeException e) {
            throw new CoreException(CoreException.Kind.INVALID, "Invalid saved state: the file is not a valid save");
        }
        competitors.clear();
        competitors.putAll(loaded);
    }

    private Map<String, Competitor> parseState(String json) throws JsonProcessingException {
        JsonNode root = JSON.readTree(json == null ? "" : json);
        if (root == null || !root.isObject()) throw bad("not a save file");
        if (!root.path("version").isInt() || root.get("version").asInt() != STATE_VERSION) {
            throw bad("unsupported or missing version");
        }
        JsonNode savedType = root.get("type");
        if (type != null && savedType != null && !savedType.isNull() && !type.name().equals(savedType.asText())) {
            throw bad("this is not a " + label(type) + " save");
        }
        JsonNode list = root.get("competitors");
        if (list == null || !list.isArray()) throw bad("competitors are missing");
        if (list.size() > MAX_COMPETITORS) throw bad("more than " + MAX_COMPETITORS + " competitors");

        Map<String, Competitor> result = new LinkedHashMap<>();
        for (JsonNode node : list) {
            if (!node.path("name").isTextual()) throw bad("a competitor has no name");
            String name = validateName(node.get("name").asText());
            if (result.containsKey(name)) throw bad("duplicate competitor " + name);
            Competitor c = new Competitor(name);
            result.put(name, c);

            JsonNode comp = node.get("competition");
            if (comp != null && !comp.isNull()) {
                try {
                    c.competition = Competition.valueOf(comp.asText());
                } catch (IllegalArgumentException e) {
                    throw bad("unknown competition for " + name);
                }
            }
            if (type != null) {
                if (c.competition != null && c.competition != type) throw bad(name + " is not a " + label(type) + " competitor");
                c.competition = type;
            }
            JsonNode results = node.get("results");
            if (results == null || !results.isObject()) throw bad("results are missing for " + name);
            for (Iterator<Map.Entry<String, JsonNode>> it = results.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> entry = it.next();
                if (!entry.getValue().isNumber()) throw bad(name + ": result for " + entry.getKey() + " is not a number");
                double raw = entry.getValue().asDouble();
                EventDef event = scoring.validate(entry.getKey(), raw);
                assign(c, event.competition());
                c.results.put(event.id(), new Result(raw, scoring.score(event.id(), raw)));
            }
        }
        return result;
    }

    private static CoreException bad(String message) {
        return new CoreException(CoreException.Kind.INVALID, message);
    }

    private static String csvRow(List<String> cells) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) sb.append(',');
            String cell = cells.get(i);
            if (cell.contains(",") || cell.contains("\"") || cell.contains("\n")) {
                sb.append('"').append(cell.replace("\"", "\"\"")).append('"');
            } else {
                sb.append(cell);
            }
        }
        return sb.append("\r\n").toString();
    }

    private static String plain(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    private Competitor find(String name) {
        String key = name == null ? "" : name.trim();
        Competitor c = competitors.get(key);
        if (c == null) {
            throw new CoreException(CoreException.Kind.NOT_FOUND, "Unknown competitor: " + key);
        }
        return c;
    }

    /** Fixes the competitor's competition, or rejects a different one. */
    private static void assign(Competitor c, Competition competition) {
        if (c.competition == null) {
            c.competition = competition;
        } else if (c.competition != competition) {
            throw new CoreException(CoreException.Kind.INVALID,
                    c.name + " is competing in " + label(c.competition) + " and cannot get " + label(competition) + " results");
        }
    }

    private static String label(Competition competition) {
        return competition == Competition.DECATHLON ? "Decathlon" : "Heptathlon";
    }

    /** A typed competition only takes its own competition's events and competitors. */
    private void requireType(Competition competition) {
        if (type != null && competition != type) {
            throw new CoreException(CoreException.Kind.INVALID,
                    "This is a " + label(type) + " competition and cannot take " + label(competition) + " results");
        }
    }

    private Competitor register(String name) {
        String n = validateName(name);
        Competitor existing = competitors.get(n);
        if (existing != null) return existing;
        if (competitors.size() >= MAX_COMPETITORS) {
            throw new CoreException(CoreException.Kind.LIMIT, "Too many competitors");
        }
        Competitor c = new Competitor(n);
        c.competition = type;
        competitors.put(n, c);
        return c;
    }
}
