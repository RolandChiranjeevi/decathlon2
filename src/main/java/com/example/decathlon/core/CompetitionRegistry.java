package com.example.decathlon.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * All competitions, each with its own competitors and results. There is always a mixed "General"
 * competition (id "default"); named ones are created with a fixed type, decathlon or heptathlon.
 */
public class CompetitionRegistry {
    public static final String DEFAULT_ID = "default";
    public static final int MAX_COMPETITIONS = 20;
    private static final int MAX_NAME_LENGTH = 60;
    private static final Pattern NAME = Pattern.compile("[\\p{L}\\p{N} '.,&()/_-]+");

    private final ScoringService scoring;
    private final Map<String, CompetitionService> all = new LinkedHashMap<>();
    private int counter;

    public CompetitionRegistry(ScoringService scoring) {
        this.scoring = scoring;
        all.put(DEFAULT_ID, new CompetitionService(scoring, DEFAULT_ID, "General", null));
    }

    /** The competition with this id; a null or blank id means the default one. */
    public synchronized CompetitionService get(String id) {
        String key = id == null || id.isBlank() ? DEFAULT_ID : id;
        CompetitionService c = all.get(key);
        if (c == null) {
            throw new CoreException(CoreException.Kind.NOT_FOUND, "Unknown competition: " + key);
        }
        return c;
    }

    /** In creation order, the default competition first. */
    public synchronized List<CompetitionService> list() {
        return new ArrayList<>(all.values());
    }

    /** Creates a competition of one type. Names are unique, ignoring case. */
    public synchronized CompetitionService create(String name, Competition type) {
        if (type == null) {
            throw invalid("Type must be Decathlon or Heptathlon");
        }
        String n = validateName(name);
        requireUnique(n, null);
        if (all.size() >= MAX_COMPETITIONS) {
            throw new CoreException(CoreException.Kind.LIMIT, "Too many competitions");
        }
        String id = "c" + (++counter);
        CompetitionService c = new CompetitionService(scoring, id, n, type);
        all.put(id, c);
        return c;
    }

    public synchronized void rename(String id, String name) {
        CompetitionService c = get(id);
        String n = validateName(name);
        requireUnique(n, c);
        c.setName(n);
    }

    /** Returns the trimmed competition name, or throws CoreException(INVALID). */
    public static String validateName(String name) {
        String n = name == null ? "" : name.trim();
        if (n.isEmpty()) {
            throw invalid("Competition name is required");
        }
        if (n.length() > MAX_NAME_LENGTH) {
            throw invalid("Competition name can be at most " + MAX_NAME_LENGTH + " characters");
        }
        if (!NAME.matcher(n).matches() || n.codePoints().noneMatch(Character::isLetterOrDigit)) {
            throw invalid("Competition name may only use letters, numbers, spaces and . , & ( ) / ' - _");
        }
        return n;
    }

    private void requireUnique(String name, CompetitionService except) {
        for (CompetitionService c : all.values()) {
            if (c != except && c.name().equalsIgnoreCase(name)) {
                throw invalid("A competition named " + c.name() + " already exists");
            }
        }
    }

    private static CoreException invalid(String message) {
        return new CoreException(CoreException.Kind.INVALID, message);
    }
}
