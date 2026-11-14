/**
 * Runs the app's two-part keybindings, like Cmd+K Cmd+S, while an editor has
 * focus.
 *
 * Cmd+K starts Monaco's own chords, so Monaco takes both parts and the app's
 * dispatcher never sees them. This binds each app chord in Monaco to a command
 * that runs the app command, the way the dispatcher would. The keybinding
 * registry picks each chord's command for both, and the rules rebuild when
 * keybindings change, so user overrides follow. A chord the user binds wins
 * over Monaco's own in editors too, since they chose it.
 */

import { getCommandRegistry, getKeybindingRegistry } from "@/commands";
import { normalizeKey } from "@/commands/keybindings/parser";
import type { KeyChord } from "@/commands/keybindings/types";
import { keybindingsAtom } from "@/store/atoms";
import * as monaco from "monaco-editor";

const RUN_APP_COMMAND = "conduit.runAppCommand";

// Normalized key names whose Monaco KeyCode is named differently
const KEY_CODE_NAMES: Record<string, string> = {
  arrowup: "uparrow",
  arrowdown: "downarrow",
  arrowleft: "leftarrow",
  arrowright: "rightarrow",
  " ": "space",
  ";": "semicolon",
  "=": "equal",
  ",": "comma",
  "-": "minus",
  ".": "period",
  "/": "slash",
  "`": "backquote",
  "[": "bracketleft",
  "\\": "backslash",
  "]": "bracketright",
  "'": "quote",
};

export function bridgeAppChords(): void {
  monaco.editor.registerCommand(
    RUN_APP_COMMAND,
    (_accessor, commandId: string) => {
      const commands = getCommandRegistry();
      if (!commands.isCommandEnabled(commandId)) return;
      commands.executeCommand(commandId).catch((error) => {
        console.error("[monacoChordBridge] Command execution failed:", error);
      });
    },
  );

  const keyCodes = new Map<string, number>();
  for (const [name, code] of Object.entries(monaco.KeyCode)) {
    if (typeof code === "number") keyCodes.set(name.toLowerCase(), code);
  }

  const toMonacoChord = ({
    ctrl,
    shift,
    alt,
    meta,
    key,
    requiredKeys,
  }: KeyChord) => {
    // Held-key chords like Cmd+Shift+B+Left have no Monaco equivalent
    if (requiredKeys) return undefined;
    const name = normalizeKey(key).toLowerCase();
    const keyCode =
      keyCodes.get(KEY_CODE_NAMES[name] ?? name) ??
      keyCodes.get(`key${name}`) ??
      keyCodes.get(`digit${name}`);
    if (keyCode === undefined) return undefined;

    const { KeyMod } = monaco;
    return (
      (meta ? KeyMod.CtrlCmd : 0) |
      (ctrl ? KeyMod.WinCtrl : 0) |
      (alt ? KeyMod.Alt : 0) |
      (shift ? KeyMod.Shift : 0) |
      keyCode
    );
  };

  const toRules = () =>
    getKeybindingRegistry()
      .getChordBindings()
      .flatMap(({ chords, commandId }) => {
        const [first, second] = chords.map(toMonacoChord);
        if (first === undefined || second === undefined) return [];
        return {
          keybinding: monaco.KeyMod.chord(first, second),
          command: RUN_APP_COMMAND,
          commandArgs: commandId,
        };
      });

  let rules: monaco.IDisposable | undefined;
  const update = () => {
    rules?.dispose();
    rules = monaco.editor.addKeybindingRules(toRules());
  };
  update();
  keybindingsAtom.subscribe(update);
}
