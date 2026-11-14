import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLauncherDialog } from "./AgentLauncherDialog";
import type { AgentConfig, LaunchGroup } from "@features/settings/model";

describe("AgentLauncherDialog", () => {
  const mockAgents: AgentConfig[] = [
    {
      id: "agent-1",
      name: "Copilot",
      command: "copilot {arg}",
      interactiveCommand: "copilot -i",
      isDefault: true,
    },
    {
      id: "agent-2",
      name: "Assistant",
      command: "assistant {arg}",
      interactiveCommand: "assistant -i",
      isDefault: false,
    },
    {
      id: "agent-3",
      name: "Helper",
      command: "helper {arg}",
      interactiveCommand: "",
      isDefault: false,
    },
  ];

  const mockTeams: LaunchGroup[] = [
    {
      id: "team-1",
      name: "Dev Team",
      agentIds: ["agent-1", "agent-2"],
    },
    {
      id: "team-2",
      name: "Test Team",
      agentIds: ["agent-2"],
      agentInstances: {
        "agent-2": {
          count: 2,
          instances: [
            { id: "agent-2-1", instructions: "Focus on tests" },
            { id: "agent-2-2", instructions: "Focus on docs" },
          ],
        },
      },
    },
  ];

  const mockOnClose = vi.fn();
  const mockOnLaunch = vi.fn();

  const dialog = (
    props: Partial<ComponentProps<typeof AgentLauncherDialog>> = {},
  ) => (
    <AgentLauncherDialog
      isOpen
      agents={mockAgents}
      onClose={mockOnClose}
      onLaunch={mockOnLaunch}
      {...props}
    />
  );

  const agentRow = (name: string) => screen.getByText(name).closest("button")!;
  const checkbox = (name: string) =>
    agentRow(name).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const plusButton = (name: string) =>
    agentRow(name).querySelector<HTMLButtonElement>(
      '[title="Increase instances"]',
    )!;
  const minusButton = (name: string) =>
    agentRow(name).querySelector<HTMLButtonElement>(
      '[title="Decrease instances"]',
    )!;
  const promptInput = () =>
    screen.getByPlaceholderText<HTMLTextAreaElement>(/Describe what you want/);
  const typePrompt = (value: string) =>
    fireEvent.change(promptInput(), { target: { value } });
  const launchButton = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "Launch" });
  const targetSelect = () =>
    screen.getByDisplayValue<HTMLSelectElement>("Worktree");
  const loadTeam = (name: string) =>
    fireEvent.click(screen.getByText(name).closest("button")!);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial Rendering", () => {
    it("should render dialog when open", () => {
      render(dialog());

      expect(screen.getByText("Launch Agents")).toBeDefined();
      expect(promptInput()).toBeDefined();
    });

    it("should not render when closed", () => {
      render(dialog({ isOpen: false }));

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("should only show agents with interactive commands", () => {
      render(dialog());

      expect(screen.getByText("Copilot")).toBeDefined();
      expect(screen.getByText("Assistant")).toBeDefined();
      expect(screen.queryByText("Helper")).toBeNull();
    });

    it("should select default agent by default", () => {
      render(dialog());

      expect(checkbox("Copilot").checked).toBe(true);
    });
  });

  describe("Agent Selection", () => {
    it("should toggle agent selection in custom mode", () => {
      render(dialog());

      expect(checkbox("Assistant").checked).toBe(false);
      fireEvent.click(agentRow("Assistant"));
      expect(checkbox("Assistant").checked).toBe(true);
      fireEvent.click(agentRow("Assistant"));
      expect(checkbox("Assistant").checked).toBe(false);
    });

    it("should show agent count", () => {
      render(dialog());

      const count = () => screen.getByText(/selected/).textContent;
      expect(count()).toBe("1 agent selected");

      fireEvent.click(agentRow("Assistant"));
      fireEvent.click(plusButton("Assistant"));
      expect(count()).toBe("2 agents selected (3 instances)");

      fireEvent.click(agentRow("Assistant"));
      expect(count()).toBe("1 agent selected");
    });
  });

  describe("Team Quick Launch", () => {
    it("should display team buttons when teams are provided", () => {
      render(dialog({ launchGroups: mockTeams }));

      expect(screen.getByText("Dev Team")).toBeDefined();
      expect(screen.getByText("Test Team")).toBeDefined();
      expect(screen.getByText("(2)")).toBeDefined();
    });

    it("should load team configuration when team button clicked", () => {
      render(dialog({ launchGroups: mockTeams }));

      loadTeam("Dev Team");
      expect(checkbox("Copilot").checked).toBe(true);
      expect(checkbox("Assistant").checked).toBe(true);

      loadTeam("Test Team");
      expect(checkbox("Copilot").checked).toBe(false);
      expect(screen.getByText(/1 agent selected/).textContent).toBe(
        "1 agent selected (2 instances)",
      );
    });

    it("should show Customize button in team mode", () => {
      render(dialog({ launchGroups: mockTeams }));
      expect(screen.queryByText("Customize")).toBeNull();

      loadTeam("Dev Team");
      fireEvent.click(agentRow("Assistant"));
      expect(checkbox("Assistant").checked).toBe(true);

      fireEvent.click(screen.getByText("Customize"));
      fireEvent.click(agentRow("Assistant"));
      expect(checkbox("Assistant").checked).toBe(false);
    });
  });

  describe("Multiple Instances", () => {
    it("should allow increasing instance count", () => {
      render(dialog());

      expect(screen.getByText("1")).toBeDefined();
      fireEvent.click(plusButton("Copilot"));
      expect(screen.getByText("2")).toBeDefined();
      expect(
        screen.getByText(/Instance 2 - Custom Instructions/),
      ).toBeDefined();
    });

    it("should allow decreasing instance count", () => {
      render(dialog());

      fireEvent.click(plusButton("Copilot"));
      fireEvent.click(plusButton("Copilot"));
      expect(screen.getByText("3")).toBeDefined();

      fireEvent.click(minusButton("Copilot"));
      expect(screen.getByText("2")).toBeDefined();
    });

    it("should not decrease below 1 instance", () => {
      render(dialog());

      expect(minusButton("Copilot").disabled).toBe(true);
    });
  });

  describe("Custom Instructions", () => {
    const instructionsInput = () =>
      screen.queryByPlaceholderText<HTMLTextAreaElement>(
        /Additional instructions/,
      );
    const writeInstructions = (value: string) => {
      fireEvent.click(screen.getByText(/Custom Instructions/));
      fireEvent.change(instructionsInput()!, { target: { value } });
    };

    it("should expand/collapse instruction fields", () => {
      render(dialog());

      expect(instructionsInput()).toBeNull();
      fireEvent.click(screen.getByText(/Custom Instructions/));
      expect(instructionsInput()).not.toBeNull();
    });

    it("should save instruction text", () => {
      render(dialog());

      writeInstructions("Focus on security");

      expect(instructionsInput()!.value).toBe("Focus on security");
    });

    it("should show indicator when instructions are set", () => {
      render(dialog());

      writeInstructions("Test instructions");

      expect(screen.getByText(/\(set\)/)).toBeDefined();
    });
  });

  describe("Launch Target", () => {
    it("should render launch target dropdown", () => {
      render(dialog());

      expect(targetSelect()).toBeDefined();
    });

    it("should allow changing launch target", async () => {
      render(dialog());

      const select = targetSelect();
      fireEvent.change(select, { target: { value: "same-folder" } });
      expect(select.value).toBe("same-folder");

      typePrompt("Write tests");
      fireEvent.click(launchButton());
      await waitFor(() =>
        expect(mockOnLaunch).toHaveBeenCalledWith(
          expect.objectContaining({ launchTarget: "same-folder" }),
        ),
      );
    });
  });

  describe("Form Submission", () => {
    it("should disable launch button when prompt is empty", () => {
      render(dialog());

      expect(launchButton().disabled).toBe(true);
    });

    it("should enable launch button when prompt is provided", () => {
      render(dialog());

      typePrompt("Write tests");
      expect(launchButton().disabled).toBe(false);

      fireEvent.click(agentRow("Copilot"));
      expect(launchButton().disabled).toBe(true);
    });

    it("should call onLaunch with correct payload", async () => {
      render(dialog());

      typePrompt("Implement feature");
      fireEvent.click(launchButton());

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: "Implement feature",
            agentIds: ["agent-1"],
            launchTarget: "worktree",
            agentInstances: expect.objectContaining({
              "agent-1": expect.objectContaining({
                count: 1,
              }),
            }),
          }),
        );
      });
    });

    it("should close dialog after successful launch", async () => {
      mockOnLaunch.mockResolvedValue(undefined);
      render(dialog());

      typePrompt("Test task");
      fireEvent.click(launchButton());

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it("should stay open and re-enable Launch when launch fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      let fail!: (error: Error) => void;
      mockOnLaunch.mockReturnValueOnce(
        new Promise((_, reject) => (fail = reject)),
      );
      render(dialog());

      typePrompt("Test task");
      fireEvent.click(launchButton());

      await waitFor(() => expect(mockOnLaunch).toHaveBeenCalled());
      const busyButton = screen
        .getByText("Launching...")
        .closest("button") as HTMLButtonElement;
      expect(busyButton.disabled).toBe(true);
      expect(busyButton.className).toContain("celebration-pulse");

      await act(async () => fail(new Error("boom")));

      await waitFor(() => {
        expect(launchButton().disabled).toBe(false);
        expect(launchButton().className).not.toContain("celebration-pulse");
      });
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(promptInput().value).toBe("Test task");
    });
  });

  describe("Dialog Reset on Open", () => {
    it("should reset state when dialog is reopened", async () => {
      const { rerender } = render(dialog());

      typePrompt("Old prompt");
      fireEvent.change(targetSelect(), { target: { value: "same-folder" } });
      expect(promptInput().value).toBe("Old prompt");

      rerender(dialog({ isOpen: false }));
      rerender(dialog());

      expect(promptInput().value).toBe("");
      expect(targetSelect()).toBeDefined();
    });
  });
});
