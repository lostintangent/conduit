// @ts-nocheck
import { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";
import { parseKeybinding } from "@/commands/keybindings/parser";
import { formatKeybindingForDisplay } from "@/commands/keybindings/utils";
import { KeybindingsTab } from "./KeybindingsTab";
import { keybindingsAtom } from "@features/workbench/client/atoms";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const display = (key) => formatKeybindingForDisplay(parseKeybinding(key));

describe("KeybindingsTab", () => {
  afterEach(() => {
    keybindingsAtom.set(new Map());
  });

  it("lists commands by category, keeping registration order within one", () => {
    const keybindingRegistry = new KeybindingRegistry();
    const commandRegistry = new CommandRegistry(
      { getAll: () => ({}) },
      keybindingRegistry,
    );
    for (const [id, category] of [
      ["view.b", "View"],
      ["pane.b", "Pane"],
      ["agent.a", "Agent"],
      ["view.a", "View"],
      ["pane.a", "Pane"],
    ]) {
      commandRegistry.registerCommand({
        id,
        title: id,
        category,
        run: () => {},
      });
    }

    render(
      <KeybindingsTab
        commandRegistry={commandRegistry}
        keybindingRegistry={keybindingRegistry}
        homeDirectory="/home"
      />,
    );

    const titles = screen
      .getAllByText(/^(view|pane|agent)\.[ab]$/)
      .map((element) => element.textContent);
    expect(titles).toEqual(["agent.a", "pane.b", "pane.a", "view.b", "view.a"]);
  });

  it("shows a keybinding change once the keybindings atom updates", async () => {
    const keybindingRegistry = new KeybindingRegistry();
    const commandRegistry = new CommandRegistry(
      { getAll: () => ({}) },
      keybindingRegistry,
    );
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      keybinding: { key: "cmd+k" },
      handler: () => {},
    });
    keybindingsAtom.set(keybindingRegistry.getAllKeybindings());

    render(
      <KeybindingsTab
        commandRegistry={commandRegistry}
        keybindingRegistry={keybindingRegistry}
        homeDirectory="/home"
      />,
    );
    expect(screen.getByText(display("cmd+k"))).toBeTruthy();

    await act(async () => {
      keybindingRegistry.unregister("test.command");
      keybindingRegistry.register("test.command", { key: "cmd+j" }, 100);
      keybindingsAtom.set(keybindingRegistry.getAllKeybindings());
    });

    expect(screen.getByText(display("cmd+j"))).toBeTruthy();
    expect(screen.queryByText(display("cmd+k"))).toBeNull();
  });
});
