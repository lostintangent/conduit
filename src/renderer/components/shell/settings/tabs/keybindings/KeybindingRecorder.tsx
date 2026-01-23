/**
 * Keybinding Recorder Component
 *
 * Records keyboard shortcuts as the user presses keys.
 * Similar to VS Code's keybinding editor.
 */

import { clearPressedKeys } from "@/commands/keybindings/parser";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface KeybindingRecorderProps {
  onKeybindingRecorded: (keybinding: string) => void;
  onCancel: () => void;
  currentKeybinding?: string;
}

export function KeybindingRecorder({
  onKeybindingRecorded,
  onCancel,
}: KeybindingRecorderProps) {
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [currentChord, setCurrentChord] = useState<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const platform = navigator.platform.toLowerCase().includes("mac")
    ? "darwin"
    : navigator.platform.toLowerCase().includes("win")
      ? "win32"
      : "linux";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Escape to cancel
      if (event.key === "Escape") {
        clearPressedKeys();
        onCancel();
        return;
      }

      // Build key combination
      const parts: string[] = [];

      // Add modifiers in correct order
      if (platform === "darwin") {
        if (event.ctrlKey) parts.push("Ctrl");
        if (event.altKey) parts.push("Alt");
        if (event.shiftKey) parts.push("Shift");
        if (event.metaKey) parts.push("Cmd");
      } else {
        if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
        if (event.shiftKey) parts.push("Shift");
        if (event.altKey) parts.push("Alt");
      }

      // Add the actual key (not a modifier)
      // Use event.code instead of event.key to get the physical key, not the character
      const key = normalizeKey(event.code, event.key);
      if (!isModifierKey(event.key)) {
        parts.push(key);
      }

      // Only record if we have at least one key
      if (parts.length > 0 && !isModifierKey(parts[parts.length - 1])) {
        const chord = parts.join("+");
        setCurrentChord(parts);

        // Clear previous timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Update recorded keys for display immediately
        setRecordedKeys((prev) => {
          const newRecordedKeys = [...prev, chord];

          // Wait 500ms to see if user wants to add another chord
          timeoutRef.current = setTimeout(() => {
            // Complete the recording
            const finalKeybinding = newRecordedKeys.join(" ");
            onKeybindingRecorded(finalKeybinding);
          }, 500);

          return newRecordedKeys;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onKeybindingRecorded, onCancel, platform]);

  const displayKeys =
    recordedKeys.length > 0
      ? recordedKeys
      : currentChord.length > 0
        ? [currentChord.join("+")]
        : [];

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border border-blue-500/50 rounded-lg shadow-2xl text-sm whitespace-nowrap">
      <div className="flex items-center gap-1">
        {displayKeys.length > 0 ? (
          displayKeys.map((chord, i) => (
            <span key={`${chord}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-400 mx-1">then</span>}
              <kbd className="px-2 py-1 bg-gray-700 rounded font-sans text-xs text-gray-200 tracking-wider">
                {formatKeybindingDisplay(chord)}
              </kbd>
            </span>
          ))
        ) : (
          <span className="text-gray-400">
            Press desired key combination...
          </span>
        )}
      </div>

      <button
        onClick={onCancel}
        className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
        title="Cancel (Esc)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function normalizeKey(code: string, fallbackKey: string): string {
  // Map event.code values to key names
  const codeMap: Record<string, string> = {
    Space: "Space",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
    Enter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
  };

  // Check for special keys in the code
  if (codeMap[code]) {
    return codeMap[code];
  }

  // Handle letter keys (e.g., "KeyA" -> "A")
  if (code.startsWith("Key")) {
    return code.substring(3).toUpperCase();
  }

  // Handle digit keys (e.g., "Digit1" -> "1")
  if (code.startsWith("Digit")) {
    return code.substring(5);
  }

  // Handle function keys (e.g., "F1" -> "F1")
  if (code.match(/^F\d+$/)) {
    return code;
  }

  // Handle numpad keys (e.g., "Numpad1" -> "Num1")
  if (code.startsWith("Numpad")) {
    return "Num" + code.substring(6);
  }

  // Fallback to event.key for other cases
  const keyMap: Record<string, string> = {
    " ": "Space",
    Meta: "Cmd",
    Control: "Ctrl",
    Alt: "Alt",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
  };

  if (keyMap[fallbackKey]) {
    return keyMap[fallbackKey];
  }

  // Single character fallback
  if (fallbackKey.length === 1) {
    return fallbackKey.toUpperCase();
  }

  return fallbackKey;
}

function isModifierKey(key: string): boolean {
  const lower = key.toLowerCase();
  return ["control", "shift", "alt", "meta", "cmd", "ctrl"].includes(lower);
}

function formatKeybindingDisplay(chord: string): string {
  const platform = navigator.platform.toLowerCase().includes("mac")
    ? "darwin"
    : navigator.platform.toLowerCase().includes("win")
      ? "win32"
      : "linux";

  const parts = chord.split("+");

  if (platform === "darwin") {
    // macOS symbols
    return parts
      .map((part) => {
        switch (part.toLowerCase()) {
          case "ctrl":
            return "⌃";
          case "alt":
            return "⌥";
          case "shift":
            return "⇧";
          case "cmd":
            return "⌘";
          case "left":
          case "arrowleft":
            return "←";
          case "right":
          case "arrowright":
            return "→";
          case "up":
          case "arrowup":
            return "↑";
          case "down":
          case "arrowdown":
            return "↓";
          case "enter":
            return "↩";
          case "escape":
            return "⎋";
          case "backspace":
            return "⌫";
          case "delete":
            return "⌦";
          case "tab":
            return "⇥";
          case "space":
            return "Space";
          default:
            return part.length === 1 ? part.toUpperCase() : part;
        }
      })
      .join("");
  } else {
    // Windows/Linux text
    return parts
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "arrowleft") return "Left";
        if (lower === "arrowright") return "Right";
        if (lower === "arrowup") return "Up";
        if (lower === "arrowdown") return "Down";
        return part.length === 1 ? part.toUpperCase() : part;
      })
      .join("+");
  }
}
