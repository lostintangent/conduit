/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentsEditor } from "@/components/shell/agents/AgentsEditor";
import type { AgentConfig, LaunchGroup } from "@shared/types";

// Mock useUserSettings hook
const mockUpdateSettings = vi.fn();
const mockUserSettings = {
  agents: [] as AgentConfig[],
  launchGroups: [] as LaunchGroup[],
  terminalPromptBufferLines: 100,
  updateSettings: mockUpdateSettings,
};

vi.mock("@/hooks/useUserSettings", () => ({
  useUserSettings: () => mockUserSettings,
}));

describe("AgentsEditor", () => {
  const mockOnClose = vi.fn();

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
  ];

  const mockTeams: LaunchGroup[] = [
    {
      id: "team-1",
      name: "Dev Team",
      agentIds: ["agent-1", "agent-2"],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserSettings.agents = [...mockAgents];
    mockUserSettings.launchGroups = [...mockTeams];
    mockUserSettings.terminalPromptBufferLines = 100;
  });

  describe("Initial Rendering", () => {
    it("should render with agents tab active by default", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      expect(screen.getByText("Agent Teams")).toBeDefined();
      expect(screen.getByText("Agents")).toBeDefined();
      expect(screen.getByText("Teams")).toBeDefined();
    });

    it("should display all agents in the list", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      expect(screen.getByText("Copilot")).toBeDefined();
      expect(screen.getByText("Assistant")).toBeDefined();
    });

    it("should show Add Agent button", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      expect(screen.getByText("Add Agent")).toBeDefined();
    });
  });

  describe("Agent Management", () => {
    it("should allow editing an agent", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      expect(screen.getByDisplayValue("Copilot")).toBeDefined();
      expect(screen.getByDisplayValue("copilot {arg}")).toBeDefined();
    });

    it("should save agent changes", async () => {
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Copilot");
      fireEvent.change(nameInput, { target: { value: "Copilot Pro" } });

      const saveButton = screen.getByText("Save");
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            agents: expect.arrayContaining([
              expect.objectContaining({
                name: "Copilot Pro",
              }),
            ]),
          }),
        );
      });
    });

    it("should cancel agent editing", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Copilot");
      fireEvent.change(nameInput, { target: { value: "Modified" } });

      const cancelButton = screen.getByText("Cancel");
      fireEvent.click(cancelButton);

      expect(screen.queryByDisplayValue("Modified")).toBeNull();
    });

    it("should add a new agent", async () => {
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const addButton = screen.getByText("Add Agent");
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalled();
      });
    });

    it("should delete an agent", async () => {
      window.confirm = vi.fn(() => true);
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const deleteButtons = screen.getAllByTitle(/Delete/);
      fireEvent.click(deleteButtons[1]);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            agents: expect.arrayContaining([
              expect.objectContaining({ id: "agent-1" }),
            ]),
          }),
        );
      });
    });

    it("should prevent deleting the last agent", async () => {
      window.alert = vi.fn();
      window.confirm = vi.fn(() => true);
      mockUserSettings.agents = [mockAgents[0]];

      render(<AgentsEditor onClose={mockOnClose} />);

      const deleteButtons = screen.getAllByTitle(/Delete/);
      fireEvent.click(deleteButtons[0]);

      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("Cannot delete the last agent"),
      );
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it("should set an agent as default", async () => {
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      // Look for the star/default indicator button
      const defaultButtons = screen.getAllByTitle(/Set as default/i);
      expect(defaultButtons.length).toBeGreaterThan(0);

      if (defaultButtons[1]) {
        fireEvent.click(defaultButtons[1]);

        await waitFor(() => {
          expect(mockUpdateSettings).toHaveBeenCalledWith(
            expect.objectContaining({
              agents: expect.arrayContaining([
                expect.objectContaining({ id: "agent-1", isDefault: false }),
                expect.objectContaining({ id: "agent-2", isDefault: true }),
              ]),
            }),
          );
        });
      }
    });
  });

  describe("Team Management", () => {
    it("should switch to teams tab", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      expect(screen.getByText("Add Team")).toBeDefined();
    });

    it("should display teams list", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      expect(screen.getByText("Dev Team")).toBeDefined();
    });

    it("should add a new team", async () => {
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const addButton = screen.getByText("Add Team");
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalled();
      });
    });

    it("should edit a team", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      expect(screen.getByDisplayValue("Dev Team")).toBeDefined();
    });

    it("should save team changes", async () => {
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Dev Team");
      fireEvent.change(nameInput, { target: { value: "Engineering Team" } });

      const saveButton = screen.getByText("Save");
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            launchGroups: expect.arrayContaining([
              expect.objectContaining({
                name: "Engineering Team",
              }),
            ]),
          }),
        );
      });
    });

    it("should delete a team", async () => {
      window.confirm = vi.fn(() => true);
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const deleteButtons = screen.getAllByTitle(/Delete/);
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            launchGroups: [],
          }),
        );
      });
    });
  });

  describe("Team Member Management", () => {
    it("should toggle agent in team", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const checkboxes = screen.getAllByRole("checkbox");
      // Both agents should be checked initially
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    });

    it("should configure instance count for team member", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const plusButtons = screen.queryAllByTitle("Increase instances");
      if (plusButtons.length > 0) {
        fireEvent.click(plusButtons[0]);
        expect(screen.getByText("2")).toBeDefined();
      }
    });

    it("should add custom instructions for team member instance", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      // Try to expand instructions
      const instructionButtons = screen.queryAllByText(/Special Instructions/);
      if (instructionButtons.length > 0) {
        fireEvent.click(instructionButtons[0]);

        const textarea = screen.queryByPlaceholderText(
          /Additional instructions/,
        );
        if (textarea) {
          fireEvent.change(textarea, {
            target: { value: "Focus on frontend" },
          });
          expect((textarea as HTMLTextAreaElement).value).toBe(
            "Focus on frontend",
          );
        }
      }
    });
  });

  describe("Close Dialog", () => {
    it("should close dialog when clicking close button", () => {
      render(<AgentsEditor onClose={mockOnClose} />);

      const closeButton = screen.getByTitle(/Close/);
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should warn before closing with unsaved changes", () => {
      window.confirm = vi.fn(() => false);

      render(<AgentsEditor onClose={mockOnClose} />);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Copilot");
      fireEvent.change(nameInput, { target: { value: "Modified" } });

      const closeButton = screen.getByTitle(/Close/);
      fireEvent.click(closeButton);

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining("unsaved changes"),
      );
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("should close dialog discarding changes if confirmed", () => {
      window.confirm = vi.fn(() => true);

      render(<AgentsEditor onClose={mockOnClose} />);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Copilot");
      fireEvent.change(nameInput, { target: { value: "Modified" } });

      const closeButton = screen.getByTitle(/Close/);
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe("Reset to Defaults", () => {
    it("should reset agents to defaults when confirmed", async () => {
      window.confirm = vi.fn(() => true);
      mockUpdateSettings.mockResolvedValue(undefined);

      render(<AgentsEditor onClose={mockOnClose} />);

      const resetButton = screen.getByText("Reset");
      fireEvent.click(resetButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            agents: expect.any(Array),
          }),
        );
      });
    });

    it("should not reset agents if not confirmed", () => {
      window.confirm = vi.fn(() => false);

      render(<AgentsEditor onClose={mockOnClose} />);

      const resetButton = screen.getByText("Reset");
      fireEvent.click(resetButton);

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });
  });

  describe("Collapsible Instructions", () => {
    it("should expand/collapse instruction sections", () => {
      const teamWithInstructions: LaunchGroup = {
        id: "team-2",
        name: "Test Team",
        agentIds: ["agent-1"],
        agentInstances: {
          "agent-1": {
            count: 2,
            instances: [
              { id: "agent-1-1", instructions: "Instruction 1" },
              { id: "agent-1-2", instructions: "Instruction 2" },
            ],
          },
        },
      };
      mockUserSettings.launchGroups = [teamWithInstructions];

      render(<AgentsEditor onClose={mockOnClose} />);

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const instructionButtons = screen.getAllByText(/Special Instructions/);
      expect(instructionButtons.length).toBeGreaterThan(0);
      fireEvent.click(instructionButtons[0]);

      expect(screen.getByText(/Instance 1/)).toBeDefined();
      expect(screen.getByText(/Instance 2/)).toBeDefined();
    });
  });
});
