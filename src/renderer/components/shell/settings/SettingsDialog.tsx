/**
 * Unified Settings Dialog Component
 *
 * Tabbed settings interface combining:
 * - General Preferences
 * - Keyboard Shortcuts
 * - Pane Actions
 * - Agents & Teams
 */

import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserSettings } from "@/hooks/useUserSettings";
import { DialogTitle } from "@radix-ui/react-dialog";
import type { UserSettings } from "@shared/types";
import { X } from "lucide-react";
import { useState } from "react";
import type { ICommandRegistry } from "../../../commands/core/CommandRegistry";
import type { KeybindingRegistry } from "../../../commands/keybindings/KeybindingRegistry";
import { AgentsTab } from "./tabs/AgentsTab";
import { GeneralTab } from "./tabs/general/GeneralTab";
import { KeybindingsTab } from "./tabs/KeybindingsTab";
import { PaneActionsTab } from "./tabs/PaneActionsTab";

interface SettingsDialogProps {
  onClose: () => void;
  commandRegistry: ICommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  homeDirectory: string;
  initialTab?: "general" | "keybindings" | "paneActions" | "agents";
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
  userSettings: ReturnType<typeof useUserSettings>;
}

export function SettingsDialog({
  onClose,
  commandRegistry,
  keybindingRegistry,
  homeDirectory,
  initialTab = "general",
  onUpdateSettings,
  userSettings,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[900px] h-[80vh] max-w-none p-0 gap-0 bg-tinted flex flex-col"
        showClose={false}
      >
        <DialogHeader>
          <div className="flex items-center justify-between px-6 py-3 border-b border-tinted-border flex-shrink-0">
            <DialogTitle>Settings</DialogTitle>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-tinted-foreground/10 rounded transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4 text-tinted-foreground/60" />
            </button>
          </div>
        </DialogHeader>

        {/* Tabs - Flex container */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-6 py-2 border-b border-tinted-border flex-shrink-0">
            <TabsList className="flex-shrink-0 border-b-0 w-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="keybindings">Keybindings</TabsTrigger>
              <TabsTrigger value="paneActions">Pane Actions</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
            </TabsList>
          </div>

          {/* General Tab */}
          <TabsContent value="general" className="flex flex-col min-h-0 flex-1">
            <GeneralTab
              userSettings={userSettings}
              onUpdateSettings={onUpdateSettings}
            />
          </TabsContent>

          {/* Keyboard Shortcuts Tab */}
          <TabsContent
            value="keybindings"
            className="flex flex-col min-h-0 flex-1"
          >
            <KeybindingsTab
              commandRegistry={commandRegistry}
              keybindingRegistry={keybindingRegistry}
              homeDirectory={homeDirectory}
            />
          </TabsContent>

          {/* Pane Actions Tab */}
          <TabsContent
            value="paneActions"
            className="flex flex-col min-h-0 flex-1"
          >
            <PaneActionsTab homeDirectory={homeDirectory} />
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents" className="flex flex-col min-h-0 flex-1">
            <AgentsTab userSettings={userSettings} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
