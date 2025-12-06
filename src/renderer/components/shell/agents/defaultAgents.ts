import type { AgentConfig } from "@shared/types";

/**
 * Default agent configurations that can be restored by the user
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "copilot",
    name: "GitHub Copilot",
    command: "gh copilot -p {arg}",
    interactiveCommand: "",
    isDefault: true,
  },
  {
    id: "copilot-review",
    name: "Copilot Code Review",
    command: "gh copilot --mode review {arg}",
    interactiveCommand: "",
    isDefault: false,
  },
  {
    id: "copilot-explain",
    name: "Copilot Explain",
    command: "gh copilot --mode explain {arg}",
    interactiveCommand: "",
    isDefault: false,
  },
  {
    id: "copilot-test",
    name: "Copilot Test Generator",
    command: "gh copilot --mode test {arg}",
    interactiveCommand: "",
    isDefault: false,
  },
  {
    id: "claude",
    name: "Claude",
    command: "claude -p {arg}",
    interactiveCommand: "aider --model claude-3.5-sonnet",
    isDefault: false,
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    command: "openai-codex {arg}",
    interactiveCommand: "aider --model gpt-4",
    isDefault: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    command: "gemini-code {arg}",
    interactiveCommand: "aider --model gemini/gemini-pro",
    isDefault: false,
  },
];
