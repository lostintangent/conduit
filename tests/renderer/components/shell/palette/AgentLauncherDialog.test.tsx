import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLauncherDialog } from "@/components/shell/palette/AgentLauncherDialog";
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial Rendering", () => {
    it("should render dialog when open", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      expect(screen.getByText("Launch Agents")).toBeDefined();
      expect(
        screen.getByPlaceholderText(/Describe what you want/),
      ).toBeDefined();
    });

    it("should not render when closed", () => {
      const { container } = render(
        <AgentLauncherDialog
          isOpen={false}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const dialog = container.querySelector('[role="dialog"]');
      expect(
        dialog === null || dialog.getAttribute("data-state") === "closed",
      ).toBe(true);
    });

    it("should only show agents with interactive commands", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      expect(screen.getByText("Copilot")).toBeDefined();
      expect(screen.getByText("Assistant")).toBeDefined();
      expect(screen.queryByText("Helper")).toBeNull();
    });

    it("should select default agent by default", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const checkbox = screen
        .getByText("Copilot")
        .closest("button")
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox?.checked).toBe(true);
    });
  });

  describe("Agent Selection", () => {
    it("should toggle agent selection in custom mode", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const assistantButton = screen.getByText("Assistant").closest("button")!;
      const checkbox = assistantButton.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
      fireEvent.click(assistantButton);
      expect(checkbox.checked).toBe(true);
      fireEvent.click(assistantButton);
      expect(checkbox.checked).toBe(false);
    });

    it("should show agent count", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      expect(screen.getByText("1 agent selected")).toBeDefined();
    });
  });

  describe("Team Quick Launch", () => {
    it("should display team buttons when teams are provided", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          launchGroups={mockTeams}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      expect(screen.getByText("Dev Team")).toBeDefined();
      expect(screen.getByText("Test Team")).toBeDefined();
      expect(screen.getByText("(2)")).toBeDefined();
    });

    it("should load team configuration when team button clicked", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          launchGroups={mockTeams}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const teamButton = screen.getByText("Dev Team").closest("button")!;
      fireEvent.click(teamButton);

      const copilotCheckbox = screen
        .getByText("Copilot")
        .closest("button")
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const assistantCheckbox = screen
        .getByText("Assistant")
        .closest("button")
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;

      expect(copilotCheckbox.checked).toBe(true);
      expect(assistantCheckbox.checked).toBe(true);
    });

    it("should show Customize button in team mode", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          launchGroups={mockTeams}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const teamButton = screen.getByText("Dev Team").closest("button")!;
      fireEvent.click(teamButton);

      expect(screen.getByText("Customize")).toBeDefined();
    });
  });

  describe("Multiple Instances", () => {
    it("should allow increasing instance count", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const plusButton = screen
        .getByText("Copilot")
        .closest("button")
        ?.querySelector('[title="Increase instances"]') as HTMLButtonElement;

      expect(screen.getByText("1")).toBeDefined();
      fireEvent.click(plusButton);
      expect(screen.getByText("2")).toBeDefined();
    });

    it("should allow decreasing instance count", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const plusButton = screen
        .getByText("Copilot")
        .closest("button")
        ?.querySelector('[title="Increase instances"]') as HTMLButtonElement;
      const minusButton = screen
        .getByText("Copilot")
        .closest("button")
        ?.querySelector('[title="Decrease instances"]') as HTMLButtonElement;

      fireEvent.click(plusButton);
      fireEvent.click(plusButton);
      expect(screen.getByText("3")).toBeDefined();

      fireEvent.click(minusButton);
      expect(screen.getByText("2")).toBeDefined();
    });

    it("should not decrease below 1 instance", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const minusButton = screen
        .getByText("Copilot")
        .closest("button")
        ?.querySelector('[title="Decrease instances"]') as HTMLButtonElement;

      expect(minusButton.disabled).toBe(true);
    });
  });

  describe("Custom Instructions", () => {
    it("should expand/collapse instruction fields", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const expandButton = screen.getByText(/Custom Instructions/);
      expect(
        screen.queryByPlaceholderText(/Additional instructions/),
      ).toBeNull();

      fireEvent.click(expandButton);
      expect(
        screen.getByPlaceholderText(/Additional instructions/),
      ).toBeDefined();
    });

    it("should save instruction text", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const expandButton = screen.getByText(/Custom Instructions/);
      fireEvent.click(expandButton);

      const textarea = screen.getByPlaceholderText(/Additional instructions/);
      fireEvent.change(textarea, { target: { value: "Focus on security" } });

      expect((textarea as HTMLTextAreaElement).value).toBe("Focus on security");
    });

    it("should show indicator when instructions are set", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const expandButton = screen.getByText(/Custom Instructions/);
      fireEvent.click(expandButton);

      const textarea = screen.getByPlaceholderText(/Additional instructions/);
      fireEvent.change(textarea, { target: { value: "Test instructions" } });

      expect(screen.getByText(/\(set\)/)).toBeDefined();
    });
  });

  describe("Launch Target", () => {
    it("should render launch target dropdown", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const select = screen.getByDisplayValue("Worktree") as HTMLSelectElement;
      expect(select).toBeDefined();
    });

    it("should allow changing launch target", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const select = screen.getByDisplayValue("Worktree") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "same-folder" } });

      expect(select.value).toBe("same-folder");
    });
  });

  describe("Form Submission", () => {
    it("should disable launch button when prompt is empty", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const launchButton = screen
        .getByText("Launch")
        .closest("button") as HTMLButtonElement;
      expect(launchButton.disabled).toBe(true);
    });

    it("should enable launch button when prompt is provided", () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Describe what you want/);
      fireEvent.change(textarea, { target: { value: "Write tests" } });

      const launchButton = screen
        .getByText("Launch")
        .closest("button") as HTMLButtonElement;
      expect(launchButton.disabled).toBe(false);
    });

    it("should call onLaunch with correct payload", async () => {
      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Describe what you want/);
      fireEvent.change(textarea, { target: { value: "Implement feature" } });

      const launchButton = screen.getByRole("button", { name: "Launch" });
      fireEvent.click(launchButton);

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

      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Describe what you want/);
      fireEvent.change(textarea, { target: { value: "Test task" } });

      const launchButton = screen.getByRole("button", { name: "Launch" });
      fireEvent.click(launchButton);

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

      render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Describe what you want/);
      fireEvent.change(textarea, { target: { value: "Test task" } });
      fireEvent.click(screen.getByRole("button", { name: "Launch" }));

      await waitFor(() => expect(mockOnLaunch).toHaveBeenCalled());
      const busyButton = screen
        .getByText("Launching...")
        .closest("button") as HTMLButtonElement;
      expect(busyButton.disabled).toBe(true);
      expect(busyButton.className).toContain("celebration-pulse");

      await act(async () => fail(new Error("boom")));

      await waitFor(() => {
        const launchButton = screen.getByRole("button", {
          name: "Launch",
        }) as HTMLButtonElement;
        expect(launchButton.disabled).toBe(false);
        expect(launchButton.className).not.toContain("celebration-pulse");
      });
      expect(mockOnClose).not.toHaveBeenCalled();
      expect((textarea as HTMLTextAreaElement).value).toBe("Test task");
    });
  });

  describe("Dialog Reset on Open", () => {
    it("should reset state when dialog is reopened", async () => {
      const { rerender } = render(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Describe what you want/);
      fireEvent.change(textarea, { target: { value: "Old prompt" } });
      expect((textarea as HTMLTextAreaElement).value).toBe("Old prompt");

      rerender(
        <AgentLauncherDialog
          isOpen={false}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      rerender(
        <AgentLauncherDialog
          isOpen={true}
          agents={mockAgents}
          onClose={mockOnClose}
          onLaunch={mockOnLaunch}
        />,
      );

      // Query the textarea again after rerender
      const newTextarea = screen.getByPlaceholderText(/Describe what you want/);
      expect((newTextarea as HTMLTextAreaElement).value).toBe("");
    });
  });
});
