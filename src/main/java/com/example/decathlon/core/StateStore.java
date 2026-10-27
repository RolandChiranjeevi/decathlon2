package com.example.decathlon.core;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Saves a competition to a file and loads it back. Any UI can use it; the file format is CompetitionService's JSON. */
public final class StateStore {
    private StateStore() {}

    /**
     * Writes the state to a temporary file next to the target and then moves it into place,
     * so a crash or full disk never leaves a half-written save over a good one.
     */
    public static void save(CompetitionService competition, Path file) throws IOException {
        Path target = file.toAbsolutePath();
        Path temp = Files.createTempFile(target.getParent(), "save-", ".tmp");
        try {
            Files.writeString(temp, competition.exportState(), StandardCharsets.UTF_8);
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    /**
     * Replaces the competition's state with the file's content. A file that is unreadable text, not a save,
     * or holds invalid data throws CoreException(INVALID) and leaves the current state untouched.
     * A file that cannot be read at all throws IOException.
     */
    public static void load(CompetitionService competition, Path file) throws IOException {
        String text;
        try {
            text = Files.readString(file, StandardCharsets.UTF_8);
        } catch (CharacterCodingException e) {
            throw new CoreException(CoreException.Kind.INVALID, "Invalid saved state: the file is not a valid save");
        }
        competition.importState(text);
    }
}
