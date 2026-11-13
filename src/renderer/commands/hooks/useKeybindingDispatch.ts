import { focusTab } from "@/store/actions/tab";
import type { ApplicationMode } from "@/store/atoms";
import type { Tab } from "@/types";
import { useEffect, useRef } from "react";
import type { ICommandRegistry } from "../core/CommandRegistry";
import type { KeybindingRegistry } from "../keybindings/KeybindingRegistry";
import {
  clearPressedKeys,
  trackKeyDown,
  trackKeyUp,
} from "../keybindings/parser";

export interface KeybindingDispatchOptions {
  /** Current application mode (normal, focus, design, overview) */
  applicationMode: ApplicationMode;
  /** Setter for application mode - used for Escape to exit modes */
  setApplicationMode: (mode: ApplicationMode) => void;
  /** List of tabs - used for Cmd+1-9 tab switching */
  tabs: Tab[];
  /** Whether the quick open dialog is open - prevents Cmd+1-9 when open */
  isQuickOpenOpen: boolean;
}

/**
 * Hook for dispatching keyboard events to commands
 *
 * This hook consolidates all keyboard handling:
 * - Escape to exit focus/design/overview modes
 * - Cmd+1-9 to switch tabs by index
 * - All command-system keybindings
 *
 * The registries can be null/undefined on initial render - the hook will
 * activate once they are provided.
 */
export function useKeybindingDispatch(
  commandRegistry: ICommandRegistry | null | undefined,
  keybindingRegistry: KeybindingRegistry | null | undefined,
  options?: KeybindingDispatchOptions,
) {
  // Use refs to avoid re-creating the listener on every chord state change
  const currentChordRef = useRef<KeyboardEvent | null>(null);
  const chordTimeoutRef = useRef<number | null>(null);

  // Use ref for options to avoid stale closures while keeping stable event listeners
  const optionsRef = useRef(options);
  optionsRef.current = options;

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

      // --- Pre-command handlers (run before command system) ---
      // Use optionsRef.current to get fresh values without re-registering listeners
      const opts = optionsRef.current;

      // Escape: Exit focus/design/overview modes
      // This runs before input element check because Escape should work even in input fields
      if (
        opts &&
        event.key === "Escape" &&
        ["focus", "overview", "design"].includes(opts.applicationMode)
      ) {
        event.preventDefault();
        clearPressedKeys();
        opts.setApplicationMode("normal");
        return;
      }

      // Cmd+1-9: Focus tab by index
      // Only when quick open dialog is closed and no shift key
      if (opts && !opts.isQuickOpenOpen) {
        if (event.metaKey && !event.shiftKey && !event.altKey) {
          const key = event.key.toLowerCase();
          const tabNumber = Number.parseInt(key, 10);

          if (!Number.isNaN(tabNumber) && tabNumber >= 1) {
            const targetIndex = Math.min(tabNumber, opts.tabs.length) - 1;
            const targetTab = opts.tabs[targetIndex];
            if (targetTab) {
              event.preventDefault();
              clearPressedKeys();
              focusTab(targetTab.id);
              return;
            }
          }
        }
      }

      // --- End pre-command handlers ---

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
          // Check if the command is enabled before committing to execute it
          // This prevents clearing pressed keys for commands whose when clause fails,
          // which would break multi-key chords like Cmd+Shift+E+Left when Cmd+Shift+E
          // matches a command that's disabled in the current context
          if (!commandRegistry.isCommandEnabled(commandId)) {
            // Clear pressed keys to prevent stale keys from blocking future keybindings
            clearPressedKeys();
            return;
          }

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
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.startsWith("Arrow")
      ) {
        // No command found for a modified arrow key combination (Cmd/Ctrl + Arrow)
        // Clear pressed keys to prevent stale keys from blocking future keybindings
        // Note: We only clear for arrow keys to avoid breaking multi-key chords like Cmd+Shift+B+Left
        // where the intermediate key (B) wouldn't match any command
        clearPressedKeys();
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
