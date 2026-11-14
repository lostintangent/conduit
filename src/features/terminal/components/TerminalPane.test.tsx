import { act, fireEvent, screen } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";

const promptStream = vi.hoisted(() => {
  const listeners = new Set<(payload: unknown) => void>();
  (window as any).conduit = {
    terminal: {
      on: (_event: string, listener: (payload: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      prompt: () => new Promise(() => {}),
    },
  };
  return {
    emit: (chunk: object) =>
      listeners.forEach((listener) =>
        listener({ sessionId: "session-1", chunk }),
      ),
  };
});

let keyHandler: (event: KeyboardEvent) => boolean;
vi.mock("../client/xtermCache", () => {
  const terminal = {
    options: {},
    focus: () => {},
    attachCustomKeyEventHandler: (handler: typeof keyHandler) => {
      keyHandler = handler;
    },
  };
  return {
    attach: () => {},
    getOrCreate: () => ({
      terminal,
      setLinkHandler: () => {},
    }),
    serializeSession: () => "",
  };
});
const createFitController = vi.hoisted(() =>
  vi.fn(() => ({ dispose: () => {} })),
);
vi.mock("../client/fitController", () => ({ createFitController }));
vi.mock("./shell/RepoScriptsMenu", () => ({ RepoScriptsMenu: () => null }));
vi.mock("./shell/TerminalGitStats", () => ({ TerminalGitStats: () => null }));
vi.mock("./shell/sandbox/ComputeTargetIndicator", () => ({
  ComputeTargetIndicator: () => null,
}));

import { TerminalPane } from "@features/terminal/components/TerminalPane";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/query";
import { render, seedSettings } from "../../../../tests/renderer/queryRender";

describe("TerminalPane agent prompt", () => {
  it("keeps receiving the agent's response while its tab is hidden", () => {
    // The pane creates its terminal with getSettings, which reads the app's client
    seedSettings(queryClient, {
      agents: [
        { id: "agent", name: "Agent", command: "agent", isDefault: true },
      ],
    });
    const inTab = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <TooltipProvider>
          <TerminalPane
            pane={{
              id: "pane-1",
              type: "terminal",
              sessionId: "session-1",
              cwd: "/repo",
              title: "zsh",
            }}
            isActive
            tabId="tab-1"
          />
        </TooltipProvider>
      </Activity>
    );
    const { rerender } = render(inTab("visible"), { queryClient });
    act(() => {
      keyHandler(new KeyboardEvent("keydown", { metaKey: true, key: "/" }));
    });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "why?" } });
    fireEvent.submit(input);

    rerender(inTab("hidden"));
    act(() => {
      promptStream.emit({ type: "data", data: "Because." });
      promptStream.emit({ type: "end" });
    });
    rerender(inTab("visible"));

    expect(screen.getByText(/Because\./)).toBeDefined();
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", false);
  });
});

describe("TerminalPane focus", () => {
  // Rebuilding it on every focus change also sent the shell a resize.
  it("keeps its terminal set up as the pane gains and loses focus", () => {
    seedSettings(queryClient, {});
    const pane = (isActive: boolean) => (
      <TooltipProvider>
        <TerminalPane
          pane={{
            id: "pane-2",
            type: "terminal",
            sessionId: "session-2",
            cwd: "/repo",
            title: "zsh",
          }}
          isActive={isActive}
          tabId="tab-1"
        />
      </TooltipProvider>
    );
    createFitController.mockClear();

    const { rerender } = render(pane(true), { queryClient });
    rerender(pane(false));
    rerender(pane(true));

    expect(createFitController).toHaveBeenCalledTimes(1);
  });
});
