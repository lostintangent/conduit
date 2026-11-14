import { describe, it, expect } from "vitest";
import {
  normalizeKeybinding,
  formatKeybindingForDisplay,
  detectKeybindingConflicts,
} from "@/commands/keybindings/utils";
import {
  isUserKeybinding,
  USER_KEYBINDING_WEIGHT,
} from "@/commands/keybindings/types";
import type {
  KeyChord,
  ResolvedKeybinding,
} from "@/commands/keybindings/types";

describe("normalizeKeybinding", () => {
  it("should normalize single chord", () => {
    const chords: KeyChord[] = [
      { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
    ];
    expect(normalizeKeybinding(chords)).toBe("Ctrl+T");
  });

  it("should normalize multi-chord keybinding", () => {
    const chords: KeyChord[] = [
      { ctrl: true, alt: false, shift: false, meta: false, key: "k" },
      { ctrl: true, alt: false, shift: false, meta: false, key: "w" },
    ];
    expect(normalizeKeybinding(chords)).toBe("Ctrl+K Ctrl+W");
  });

  it("should be platform-independent", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: true, key: "k" },
    ];
    // Always returns "Cmd" regardless of platform
    expect(normalizeKeybinding(chords)).toBe("Cmd+K");
  });

  it("should handle all modifier combinations", () => {
    const chords: KeyChord[] = [
      { ctrl: true, alt: true, shift: true, meta: false, key: "f" },
    ];
    expect(normalizeKeybinding(chords)).toBe("Ctrl+Alt+Shift+F");
  });

  it("should handle special keys without transformation", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: false, key: "ArrowUp" },
    ];
    // normalizeKeybinding doesn't transform keys to symbols
    expect(normalizeKeybinding(chords)).toBe("ArrowUp");
  });

  it("should uppercase single character keys", () => {
    const chords: KeyChord[] = [
      { ctrl: true, alt: false, shift: false, meta: false, key: "a" },
    ];
    expect(normalizeKeybinding(chords)).toBe("Ctrl+A");
  });

  it("should preserve multi-character keys as-is", () => {
    const chords: KeyChord[] = [
      { ctrl: true, alt: false, shift: false, meta: false, key: "Enter" },
    ];
    expect(normalizeKeybinding(chords)).toBe("Ctrl+Enter");
  });

  it("should handle keys with no modifiers", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: false, key: "a" },
    ];
    expect(normalizeKeybinding(chords)).toBe("A");
  });

  it("should maintain consistent modifier order", () => {
    // Order: Ctrl, Alt, Shift, Meta
    const chords: KeyChord[] = [
      { ctrl: true, alt: true, shift: true, meta: true, key: "z" },
    ];
    expect(normalizeKeybinding(chords)).toBe("Ctrl+Alt+Shift+Cmd+Z");
  });

  it("should include required keys (Cmd+Shift+B+Left)", () => {
    const chords: KeyChord[] = [
      {
        ctrl: false,
        alt: false,
        shift: true,
        meta: true,
        key: "left",
        requiredKeys: ["b"],
      },
    ];
    expect(normalizeKeybinding(chords)).toBe("Shift+Cmd+B+left");
  });

  it("should include multiple required keys", () => {
    const chords: KeyChord[] = [
      {
        ctrl: false,
        alt: false,
        shift: false,
        meta: true,
        key: "c",
        requiredKeys: ["a", "b"],
      },
    ];
    expect(normalizeKeybinding(chords)).toBe("Cmd+A+B+C");
  });
});

describe("formatKeybindingForDisplay", () => {
  it("should format for display with platform-specific symbols", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: true, key: "k" },
    ];
    const result = formatKeybindingForDisplay(chords);
    // On Mac: "⌘K", on others: "Ctrl+K"
    expect(result).toMatch(/^(⌘K|Ctrl\+K)$/);
  });

  it("should handle multi-chord keybindings", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: true, key: "k" },
      { ctrl: false, alt: false, shift: false, meta: true, key: "w" },
    ];
    const result = formatKeybindingForDisplay(chords);
    // Should have space between chords
    expect(result).toContain(" ");
  });

  it("should transform special keys to symbols", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: false, key: "ArrowUp" },
    ];
    const result = formatKeybindingForDisplay(chords);
    expect(result).toBe("↑");
  });

  it("should format Enter key", () => {
    const chords: KeyChord[] = [
      { ctrl: false, alt: false, shift: false, meta: false, key: "Enter" },
    ];
    const result = formatKeybindingForDisplay(chords);
    expect(result).toBe("↵");
  });

  it("should format all modifiers", () => {
    const chords: KeyChord[] = [
      { ctrl: true, alt: true, shift: true, meta: false, key: "a" },
    ];
    const result = formatKeybindingForDisplay(chords);
    // Should contain all three modifiers
    expect(result).toMatch(/(Ctrl|⌃)/);
    expect(result).toMatch(/(Alt|⌥)/);
    expect(result).toMatch(/(Shift|⇧)/);
  });

  it("should include required keys (Cmd+Shift+B+Left)", () => {
    const chords: KeyChord[] = [
      {
        ctrl: false,
        alt: false,
        shift: true,
        meta: true,
        key: "left",
        requiredKeys: ["b"],
      },
    ];
    const result = formatKeybindingForDisplay(chords);
    // On Mac: "⇧⌘B←", on others: "Shift+Ctrl+B+←"
    expect(result).toMatch(/B/); // Required key "B" should be present
    expect(result).toMatch(/←/); // Arrow should be formatted as symbol
  });

  it("should include multiple required keys", () => {
    const chords: KeyChord[] = [
      {
        ctrl: false,
        alt: false,
        shift: false,
        meta: true,
        key: "c",
        requiredKeys: ["a", "b"],
      },
    ];
    const result = formatKeybindingForDisplay(chords);
    // Should contain both required keys A and B
    expect(result).toMatch(/A/);
    expect(result).toMatch(/B/);
    expect(result).toMatch(/C/);
  });
});

describe("detectKeybindingConflicts", () => {
  it("should detect two commands with same key", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    keybindingsByCommand.set("cmd1", [
      {
        commandId: "cmd1",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    keybindingsByCommand.set("cmd2", [
      {
        commandId: "cmd2",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(1);
    expect(conflicts.get("Ctrl+T")).toEqual(["cmd1", "cmd2"]);
  });

  it("should detect multiple conflicts", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    // Conflict 1: Ctrl+T
    keybindingsByCommand.set("cmd1", [
      {
        commandId: "cmd1",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    keybindingsByCommand.set("cmd2", [
      {
        commandId: "cmd2",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    // Conflict 2: Alt+K
    keybindingsByCommand.set("cmd3", [
      {
        commandId: "cmd3",
        chords: [
          { ctrl: false, alt: true, shift: false, meta: false, key: "k" },
        ],
        weight: 0,
      },
    ]);

    keybindingsByCommand.set("cmd4", [
      {
        commandId: "cmd4",
        chords: [
          { ctrl: false, alt: true, shift: false, meta: false, key: "k" },
        ],
        weight: 0,
      },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(2);
    expect(conflicts.get("Ctrl+T")).toEqual(["cmd1", "cmd2"]);
    expect(conflicts.get("Alt+K")).toEqual(["cmd3", "cmd4"]);
  });

  it("should return empty map when no conflicts", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    keybindingsByCommand.set("cmd1", [
      {
        commandId: "cmd1",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    keybindingsByCommand.set("cmd2", [
      {
        commandId: "cmd2",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "k" },
        ],
        weight: 0,
      },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(0);
  });

  it("should normalize keys for comparison", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    // Both should normalize to "Ctrl+T" despite different case
    keybindingsByCommand.set("cmd1", [
      {
        commandId: "cmd1",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    keybindingsByCommand.set("cmd2", [
      {
        commandId: "cmd2",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "T" },
        ],
        weight: 0,
      },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(1);
  });

  it("should handle multi-chord conflicts", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    const multiChord: KeyChord[] = [
      { ctrl: true, alt: false, shift: false, meta: false, key: "k" },
      { ctrl: true, alt: false, shift: false, meta: false, key: "w" },
    ];

    keybindingsByCommand.set("cmd1", [
      {
        commandId: "cmd1",
        chords: multiChord,
        weight: 0,
      },
    ]);

    keybindingsByCommand.set("cmd2", [
      {
        commandId: "cmd2",
        chords: multiChord,
        weight: 0,
      },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(1);
    expect(conflicts.get("Ctrl+K Ctrl+W")).toEqual(["cmd1", "cmd2"]);
  });

  it("should handle command with multiple keybindings", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    // cmd1 has two different keybindings
    keybindingsByCommand.set("cmd1", [
      {
        commandId: "cmd1",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
      {
        commandId: "cmd1",
        chords: [
          { ctrl: false, alt: true, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    // cmd2 conflicts with one of cmd1's bindings
    keybindingsByCommand.set("cmd2", [
      {
        commandId: "cmd2",
        chords: [
          { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
        ],
        weight: 0,
      },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(1);
    expect(conflicts.get("Ctrl+T")).toContain("cmd1");
    expect(conflicts.get("Ctrl+T")).toContain("cmd2");
  });

  it("should handle three-way conflicts", () => {
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();

    const sameKey: KeyChord[] = [
      { ctrl: true, alt: false, shift: false, meta: false, key: "t" },
    ];

    keybindingsByCommand.set("cmd1", [
      { commandId: "cmd1", chords: sameKey, weight: 0 },
    ]);
    keybindingsByCommand.set("cmd2", [
      { commandId: "cmd2", chords: sameKey, weight: 0 },
    ]);
    keybindingsByCommand.set("cmd3", [
      { commandId: "cmd3", chords: sameKey, weight: 0 },
    ]);

    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    expect(conflicts.size).toBe(1);
    expect(conflicts.get("Ctrl+T")).toEqual(["cmd1", "cmd2", "cmd3"]);
  });
});

describe("isUserKeybinding", () => {
  it("should return true for weight equal to USER_KEYBINDING_WEIGHT", () => {
    const binding: ResolvedKeybinding = {
      commandId: "test",
      chords: [],
      weight: USER_KEYBINDING_WEIGHT,
    };
    expect(isUserKeybinding(binding)).toBe(true);
  });

  it("should return true for weight greater than USER_KEYBINDING_WEIGHT", () => {
    const binding: ResolvedKeybinding = {
      commandId: "test",
      chords: [],
      weight: USER_KEYBINDING_WEIGHT + 100,
    };
    expect(isUserKeybinding(binding)).toBe(true);
  });

  it("should return false for weight less than USER_KEYBINDING_WEIGHT", () => {
    const binding: ResolvedKeybinding = {
      commandId: "test",
      chords: [],
      weight: 0,
    };
    expect(isUserKeybinding(binding)).toBe(false);
  });

  it("should verify USER_KEYBINDING_WEIGHT is 1000", () => {
    // This test documents the expected constant value
    expect(USER_KEYBINDING_WEIGHT).toBe(1000);
  });
});
