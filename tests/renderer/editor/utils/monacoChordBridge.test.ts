import { hasWorkspace } from "@/commands/contextKeys/appContextKeys";
import { USER_KEYBINDING_WEIGHT } from "@/commands/keybindings/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { editor } = vi.hoisted(() => ({
  editor: {
    registerCommand: vi.fn(),
    addKeybindingRules: vi.fn(),
  },
}));

vi.mock("monaco-editor", async () => {
  const { KeyMod, KeyCode } = await import("../../../setup/monaco-keys");
  return { editor, KeyMod, KeyCode };
});

// The bridge subscribes for the app's lifetime, so each test loads fresh
// modules, with their own command registry and keybindings atom
async function bridgeFreshApp() {
  vi.resetModules();
  const commands = await import("@/commands");
  const { updateKeybindingsAtom } =
    await import("@/commands/keybindings/updateKeybindingsAtom");
  const { bridgeAppChords } =
    await import("@/components/panes/editor/utils/monacoChordBridge");
  const { keybindingLabel } = await import("../../../setup/monaco-keys");
  bridgeAppChords();

  const [[bridgeCommand, runAppCommand]] = editor.registerCommand.mock.calls;
  return {
    commandRegistry: commands.getCommandRegistry(),
    keybindingRegistry: commands.getKeybindingRegistry(),
    updateKeybindingsAtom,
    /** The chords Monaco currently has bound to the bridge, by app command */
    bridgedChords: () => {
      const rules: {
        keybinding: number;
        command: string;
        commandArgs: string;
      }[] = editor.addKeybindingRules.mock.lastCall?.[0] ?? [];
      return Object.fromEntries(
        rules
          .filter(({ command }) => command === bridgeCommand)
          .map(({ keybinding, commandArgs }) => [
            commandArgs,
            keybindingLabel(keybinding),
          ]),
      );
    },
    /** What Monaco does when a bridged chord is pressed */
    pressBridgedChord: (commandId: string) => runAppCommand(null, commandId),
  };
}

describe("bridgeAppChords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editor.addKeybindingRules.mockImplementation(() => ({ dispose: vi.fn() }));
  });

  it("binds each app chord in Monaco to run the app command", async () => {
    const app = await bridgeFreshApp();
    const save = vi.fn();
    const close = vi.fn();
    app.commandRegistry.registerCommand({
      id: "workspace.save",
      title: "Save Workspace",
      keybinding: { key: "Cmd+K Cmd+W" },
      run: save,
    });
    app.commandRegistry.registerCommand({
      id: "workspace.close",
      title: "Close Workspace",
      keybinding: { key: "Cmd+K F" },
      run: close,
    });
    app.commandRegistry.registerCommand({
      id: "pane.moveLeft",
      title: "Move Pane Left",
      keybinding: { key: "Cmd+K Ctrl+Alt+Shift+Left" },
      run: vi.fn(),
    });
    app.commandRegistry.registerCommand({
      id: "editor.toggleComment",
      title: "Toggle Comment",
      keybinding: { key: "Cmd+K Cmd+/" },
      run: vi.fn(),
    });
    // Monaco takes neither of these, so they aren't bridged
    app.commandRegistry.registerCommand({
      id: "tab.new",
      title: "New Tab",
      keybinding: { key: "Cmd+T" },
      run: vi.fn(),
    });
    app.commandRegistry.registerCommand({
      id: "pane.splitBrowser",
      title: "Split Browser",
      keybinding: { key: "Cmd+K Cmd+Shift+B+Left" },
      run: vi.fn(),
    });
    app.updateKeybindingsAtom();

    expect(app.bridgedChords()).toEqual({
      "workspace.save": "cmd+k cmd+w",
      "workspace.close": "cmd+k f",
      "pane.moveLeft": "cmd+k ctrl+shift+alt+left",
      "editor.toggleComment": "cmd+k cmd+/",
    });

    await app.pressBridgedChord("workspace.close");
    expect(close).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("doesn't run a command its when clause disables", async () => {
    const app = await bridgeFreshApp();
    const close = vi.fn();
    app.commandRegistry.registerCommand({
      id: "workspace.close",
      title: "Close Workspace",
      keybinding: { key: "Cmd+K F" },
      when: hasWorkspace.isTrue(),
      run: close,
    });
    app.updateKeybindingsAtom();

    await app.pressBridgedChord("workspace.close");

    expect(close).not.toHaveBeenCalled();
  });

  it("follows keybinding changes, and a user's chord wins over a default", async () => {
    const app = await bridgeFreshApp();
    app.commandRegistry.registerCommand({
      id: "workspace.close",
      title: "Close Workspace",
      keybinding: { key: "Cmd+K F" },
      run: vi.fn(),
    });
    app.commandRegistry.registerCommand({
      id: "workspace.rename",
      title: "Rename Workspace",
      keybinding: { key: "Cmd+K Cmd+R" },
      run: vi.fn(),
    });
    app.updateKeybindingsAtom();
    const firstRules = editor.addKeybindingRules.mock.results.at(-1)?.value;

    // What loading a user's keybindings.json does
    app.keybindingRegistry.unregister("workspace.close");
    app.keybindingRegistry.register(
      "workspace.close",
      { key: "Cmd+K Cmd+R" },
      USER_KEYBINDING_WEIGHT,
    );
    app.updateKeybindingsAtom();

    expect(firstRules?.dispose).toHaveBeenCalledTimes(1);
    expect(app.bridgedChords()).toEqual({ "workspace.close": "cmd+k cmd+r" });
  });
});
