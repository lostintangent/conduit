import { useEffect, useState } from 'react';
import type { ICommandRegistry } from '../core/CommandRegistry';
import type { KeybindingRegistry } from './KeybindingRegistry';

/**
 * Hook for dispatching keyboard events to commands
 */
export function useKeybindingDispatch(
  commandRegistry: ICommandRegistry,
  keybindingRegistry: KeybindingRegistry
) {
  const [currentChord, setCurrentChord] = useState<KeyboardEvent | null>(null);
  const [chordTimeout, setChordTimeout] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Ignore events from input elements (unless explicitly handled)
      if (isInputElement(event.target)) {
        return;
      }

      const chordIndex = currentChord ? 1 : 0;

      // Find matching command
      const commandId = keybindingRegistry.findCommand(event, chordIndex);

      if (commandId) {
        // Check if this is part of a chord sequence
        const hasMore = keybindingRegistry.hasChordContinuation(event, chordIndex);

        if (hasMore && chordIndex === 0) {
          // This is the first chord in a sequence, wait for next chord
          event.preventDefault();
          setCurrentChord(event);

          // Set timeout to clear chord state
          const timeout = window.setTimeout(() => {
            setCurrentChord(null);
          }, 1000);
          setChordTimeout(timeout);
        } else {
          // Execute command
          event.preventDefault();
          clearChordState();
          await commandRegistry.executeCommand(commandId);
        }
      } else if (currentChord) {
        // No match for second chord, clear state
        clearChordState();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearChordState();
    };
  }, [commandRegistry, keybindingRegistry, currentChord, chordTimeout]);

  const clearChordState = () => {
    setCurrentChord(null);
    if (chordTimeout) {
      clearTimeout(chordTimeout);
      setChordTimeout(null);
    }
  };
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    target.isContentEditable
  );
}
