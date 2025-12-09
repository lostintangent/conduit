/**
 * Agents Tab Component
 *
 * Wrapper for the agents editor functionality
 */

import { useUserSettings } from "@/hooks/useUserSettings";
import { AgentsEditorContent } from "../../agents/AgentsEditorContent";

interface AgentsTabProps {
  userSettings: ReturnType<typeof useUserSettings>;
}

export function AgentsTab({ userSettings }: AgentsTabProps) {
  return <AgentsEditorContent userSettings={userSettings} />;
}
