import { useEffect, useRef } from "react";
import type { ICommandRegistry } from "../core/CommandRegistry";
import type { KeybindingRegistry } from "./KeybindingRegistry";
import {
  clearPressedKeys,
  trackKeyDown,
  trackKeyUp,
} from "../keybindings/parser";

/**
 * Hook for dispatching keyboard events to commands
 *
 * The registries can be null/undefined on initial render - the hook will
 * activate once they are provided.
 */
export function useKeybindingDispatch(
  commandRegistry: ICommandRegistry | null | undefined,
  keybindingRegistry: KeybindingRegistry | null | undefined,
) {
  // Use refs to avoid re-creating the listener on every chord state change
  const currentChordRef = useRef<KeyboardEvent | null>(null);
  const chordTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Early return if registries aren't ready yet
    if (!commandRegistry || !keybindingRegistry) {
      return;
    }

    // Define clearChordState inside useEffect to avoid stale closures
    const clearChordState = () => {
      currentChordRef.current = null;
      if (chordTimeoutRef.current) {
        clearTimeout(chordTimeoutRef.current);
        chordTimeoutRef.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Track pressed keys for multi-key chords (e.g., Cmd+Shift+B+Left)
      trackKeyDown(event);

      // Fast path: Skip ALL processing for plain text in input elements
      // This handles the 99% case (typing in terminal) in <1 microsecond
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        isInputElement(event.target)
      ) {
        return; // Exit immediately - no command processing needed
      }

      const chordIndex = currentChordRef.current ? 1 : 0;

      // Find matching command
      const commandId = keybindingRegistry.findCommand(event, chordIndex);

      if (commandId) {
        // Check if this is part of a chord sequence
        const hasMore = keybindingRegistry.hasChordContinuation(
          event,
          chordIndex,
        );

        if (hasMore && chordIndex === 0) {
          // This is the first chord in a sequence, wait for next chord
          event.preventDefault();
          currentChordRef.current = event;

          // Clear pressed keys after first chord to prevent them from interfering
          // with the second chord matching
          clearPressedKeys();

          // Set timeout to clear chord state
          const timeout = window.setTimeout(() => {
            currentChordRef.current = null;
          }, 1000);
          chordTimeoutRef.current = timeout;
        } else {
          // Execute command
          event.preventDefault();
          clearChordState();

          // Clear pressed keys after command execution to prevent stale keys
          // from interfering with subsequent commands
          clearPressedKeys();

          // Execute asynchronously without blocking
          commandRegistry.executeCommand(commandId).catch((error) => {
            console.error(
              "[useKeybindingDispatch] Command execution failed:",
              error,
            );
          });
        }
      } else if (currentChordRef.current) {
        // No match for second chord, clear state
        clearChordState();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Track key releases for multi-key chords
      trackKeyUp(event);
    };

    const handleBlur = () => {
      // Clear all tracked keys when window loses focus
      clearPressedKeys();
      clearChordState();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      clearChordState();
      clearPressedKeys();
    };
  }, [commandRegistry, keybindingRegistry]); // Only re-run when registries change, not on every keystroke
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target.isContentEditable ||
    target.contentEditable === "true" // Fallback for jsdom and older browsers
  );
}
