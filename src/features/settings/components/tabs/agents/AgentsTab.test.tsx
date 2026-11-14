import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryClient } from "@/query";
import { notificationsAtom } from "@/store/atoms";
import {
  render,
  seedSettings,
  testSettings,
} from "../../../../../../tests/renderer/queryRender";
import { AgentsTab } from "./AgentsTab";
import type { AgentConfig, LaunchGroup, UserSettings } from "../../../model";

let settings: UserSettings;
const mockUpdateSettings = vi.fn();

function renderAgentsTab() {
  return render(<AgentsTab />, {
    queryClient: seedSettings(createQueryClient(), settings),
  });
}

describe("AgentsEditor", () => {
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
    notificationsAtom.set([]);
    settings = testSettings({
      agents: [...mockAgents],
      launchGroups: [...mockTeams],
      terminalPromptBufferLines: 100,
    });
    // Main saves the updates and replies with all the settings
    mockUpdateSettings.mockImplementation(async (updates) => {
      settings = { ...settings, ...updates };
      return settings;
    });
    (window as any).conduit = {
      settings: { update: mockUpdateSettings, get: async () => settings },
    };
  });

  describe("Initial Rendering", () => {
    it("should render with agents tab active by default", () => {
      renderAgentsTab();

      expect(screen.getByText("Agents")).toBeDefined();
      expect(screen.getByText("Teams")).toBeDefined();
    });

    it("should display all agents in the list", () => {
      renderAgentsTab();

      expect(screen.getByText("Copilot")).toBeDefined();
      expect(screen.getByText("Assistant")).toBeDefined();
    });

    it("should show Add Agent button", () => {
      renderAgentsTab();

      expect(screen.getByText("Add Agent")).toBeDefined();
    });
  });

  describe("Agent Management", () => {
    it("should allow editing an agent", () => {
      renderAgentsTab();

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      expect(screen.getByDisplayValue("Copilot")).toBeDefined();
      expect(screen.getByDisplayValue("copilot {arg}")).toBeDefined();
    });

    it("should save agent changes", async () => {
      renderAgentsTab();

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
      await waitFor(() =>
        expect(screen.queryByDisplayValue("Copilot Pro")).toBeNull(),
      );
      expect(screen.getByText("Copilot Pro")).toBeDefined();
    });

    it("keeps the agent's edits open, and shows the error, when they fail to save", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockUpdateSettings.mockRejectedValue(
        new Error("EACCES: permission denied"),
      );
      renderAgentsTab();

      fireEvent.click(screen.getAllByTitle(/Edit/)[0]);
      fireEvent.change(screen.getByDisplayValue("Copilot"), {
        target: { value: "Copilot Pro" },
      });
      fireEvent.click(screen.getByText("Save"));

      await waitFor(() =>
        expect(notificationsAtom.get()).toMatchObject([
          {
            kind: "error",
            message: "Couldn't update settings",
            details: "EACCES: permission denied",
          },
        ]),
      );
      expect(screen.getByDisplayValue("Copilot Pro")).toBeDefined();
    });

    it("should cancel agent editing", () => {
      renderAgentsTab();

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Copilot");
      fireEvent.change(nameInput, { target: { value: "Modified" } });

      const cancelButton = screen.getByText("Cancel");
      fireEvent.click(cancelButton);

      expect(screen.queryByDisplayValue("Modified")).toBeNull();
    });

    it("should add a new agent", async () => {
      renderAgentsTab();

      const addButton = screen.getByText("Add Agent");
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalled();
      });
    });

    it("should delete an agent", async () => {
      window.confirm = vi.fn(() => true);
      renderAgentsTab();

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
      settings.agents = [mockAgents[0]];

      renderAgentsTab();

      const deleteButtons = screen.getAllByTitle(/Delete/);
      fireEvent.click(deleteButtons[0]);

      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("Cannot delete the last agent"),
      );
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it("should set an agent as default", async () => {
      renderAgentsTab();

      // Only the non-default agent (agent-2) offers the button
      fireEvent.click(screen.getByTitle("Set as default"));

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
    });
  });

  describe("Team Management", () => {
    it("should switch to teams tab", () => {
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      expect(screen.getByText("Add Team")).toBeDefined();
    });

    it("should display teams list", () => {
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      expect(screen.getByText("Dev Team")).toBeDefined();
    });

    it("should add a new team", async () => {
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const addButton = screen.getByText("Add Team");
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalled();
      });
    });

    it("should edit a team", () => {
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      expect(screen.getByDisplayValue("Dev Team")).toBeDefined();
    });

    it("should save team changes", async () => {
      renderAgentsTab();

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
      renderAgentsTab();

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
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      const checkboxes = screen.getAllByRole("checkbox");
      // Both agents should be checked initially
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    });

    it("should configure instance count for team member", async () => {
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      fireEvent.click(screen.getAllByTitle("Increase instances")[0]);
      fireEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          launchGroups: [
            expect.objectContaining({
              id: "team-1",
              agentInstances: {
                "agent-1": {
                  count: 2,
                  instances: [
                    { id: "agent-1-1", instructions: "" },
                    { id: "agent-1-2", instructions: "" },
                  ],
                },
              },
            }),
          ],
        });
      });
    });

    it("should add custom instructions for team member instance", async () => {
      renderAgentsTab();

      const teamsTab = screen.getByText("Teams");
      fireEvent.click(teamsTab);

      const editButtons = screen.getAllByTitle(/Edit/);
      fireEvent.click(editButtons[0]);

      fireEvent.click(screen.getAllByTitle("Expand instructions")[0]);
      fireEvent.change(
        screen.getByPlaceholderText(
          "Custom instructions for this Copilot instance...",
        ),
        { target: { value: "Focus on frontend" } },
      );
      fireEvent.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          launchGroups: [
            expect.objectContaining({
              id: "team-1",
              agentInstances: {
                "agent-1": {
                  count: 1,
                  instances: [
                    { id: "agent-1-1", instructions: "Focus on frontend" },
                  ],
                },
              },
            }),
          ],
        });
      });
    });
  });

  describe("Reset to Defaults", () => {
    it("should reset agents to defaults when confirmed", async () => {
      window.confirm = vi.fn(() => true);
      renderAgentsTab();

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

      renderAgentsTab();

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
      settings.launchGroups = [teamWithInstructions];

      renderAgentsTab();

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
