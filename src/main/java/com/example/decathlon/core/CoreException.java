package com.example.decathlon.core;

/** Error raised by the core. Each UI decides how to show it. */
public class CoreException extends RuntimeException {
    public enum Kind { INVALID, NOT_FOUND, LIMIT }

    private final Kind kind;

    public CoreException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public Kind kind() { return kind; }
}
