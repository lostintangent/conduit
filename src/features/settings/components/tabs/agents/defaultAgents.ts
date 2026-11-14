import type { AgentConfig } from "../../../model";

/**
 * Default agent configurations that can be restored by the user
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "sonnet",
    name: "Copilot (Sonnet 4.5)",
    command: "copilot -p {arg} --model claude-sonnet-4.5",
    interactiveCommand: "copilot -i {arg} --model claude-sonnet-4.5",
    isDefault: true,
  },
  {
    id: "opus",
    name: "Copilot (Opus 4.5)",
    command: "copilot -p {arg} --model claude-opus-4.5",
    interactiveCommand: "copilot -i {arg} --model claude-opus-4.5",
    isDefault: false,
  },
  {
    id: "haiku",
    name: "Copilot (Haiku 4.5)",
    command: "copilot -p {arg} --model claude-haiku-4.5",
    interactiveCommand: "copilot -i {arg} --model claude-haiku-4.5",
    isDefault: false,
  },
  {
    id: "codex",
    name: "Copilot (Codex 5.1)",
    command: "copilot -p {arg} --model gpt-5.1-codex",
    interactiveCommand: "copilot -i {arg} --model gpt-5.1-codex",
    isDefault: false,
  },
  {
    id: "codex-max",
    name: "Copilot (Codex 5.1 Max)",
    command: "copilot -p {arg} --model gpt-5.1-codex-max",
    interactiveCommand: "copilot -i {arg} --model gpt-5.1-codex-max",
    isDefault: false,
  },
  {
    id: "gemini",
    name: "Copilot (Gemini 3 Pro)",
    command: "copilot -p {arg} --model gemini-3-pro-preview",
    interactiveCommand: "copilot -i {arg} --model gemini-3-pro-preview",
    isDefault: false,
  },
];
