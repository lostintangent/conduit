/**
 * Pane Action Icon Component
 *
 * Centralized icon mapping and rendering for pane actions.
 * Based on: docs/pane-actions-schema.md
 */

import {
  Book,
  Bot,
  Bug,
  Cloud,
  Code,
  Container,
  Database,
  GitBranch,
  Globe,
  HelpCircle,
  Package,
  Palette,
  Rocket,
  Server,
  Shield,
  Terminal,
  TestTube,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon mapping for pane actions
 * Maps icon IDs to Lucide React components
 */
export const PANE_ACTION_ICON_MAP: Record<string, LucideIcon> = {
  "git-branch": GitBranch,
  code: Code,
  terminal: Terminal,
  globe: Globe,
  bot: Bot,
  cloud: Cloud,
  container: Container,
  database: Database,
  package: Package,
  palette: Palette,
  server: Server,
  "test-tube": TestTube,
  bug: Bug,
  rocket: Rocket,
  shield: Shield,
  book: Book,
  wrench: Wrench,
};

/**
 * Get sorted list of available icon IDs
 */
export function getAvailableIconIds(): string[] {
  return Object.keys(PANE_ACTION_ICON_MAP).sort();
}

interface PaneActionIconProps {
  /** Icon ID from the pane actions schema */
  iconId: string;
  /** Optional CSS classes for the icon */
  className?: string;
}

/**
 * Renders a pane action icon
 * Falls back to HelpCircle if icon ID is not found
 */
export function PaneActionIcon({
  iconId,
  className = "w-4 h-4",
}: PaneActionIconProps) {
  const IconComponent = PANE_ACTION_ICON_MAP[iconId] || HelpCircle;
  return <IconComponent className={className} />;
}
