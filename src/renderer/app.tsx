import { CommandPalette } from "@/components/CommandPalette";
import { TabLayout } from "@/components/tabs/layout/TabLayout";
import { TabStrip } from "@/components/tabs/TabStrip";
import { TabTitleDialog } from "@/components/tabs/TabTitleDialog";
import { TerminalDialog } from "@/components/TerminalDialog";
import { TitleBar } from "@/components/TitleBar";
import { UrlDialog } from "@/components/UrlDialog";
import { useAppPreferences } from "@/hooks/useAppPreferences";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useGlobalKeyHandlers } from "@/hooks/useGlobalKeyHandlers";
import { useLayoutResizing } from "@/hooks/useLayoutResizing";
import { openWebViewPane, removePane } from "@/store/actions/pane";
import {
  closeTab,
  openTab,
  openTabFromExistingSession,
  registerTabEventHandlers,
  updateTabProperty,
} from "@/store/actions/tab";
import { tabsAtom } from "@/store/atoms";
import { disposeSession } from "@/store/terminals";
import type { Command } from "@/types";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

export function App() {
  const {
    tabPosition,
    alwaysShowTabStrip,
    commandHistory,

    recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  } = useAppPreferences();

  const { isCommandPaletteOpen, openCommandPalette, closeCommandPalette } =
    useGlobalKeyHandlers();

  const { resizingNode, handleResizeStart, hasCustomLayout, resetLayoutSizes } =
    useLayoutResizing();

  const [tabs, setTabs] = useAtom(tabsAtom);
  const [titleModalState, setTitleModalState] = useState<{
    tabId: string;
    initialValue: string;
  } | null>(null);
  const [terminalModalState, setTerminalModalState] = useState<{
    sessionId: string;
    cwd: string | null;
    title: string;
    command: string;
  } | null>(null);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);

  useEffect(() => {
    const cleanup = registerTabEventHandlers();
    openTab();

    return cleanup;
  }, []);

  useEffect(() => {
    const api = window.conduit;
    if (!api) {
      return () => {};
    }

    const unsubscribeExit = api.onExit(({ sessionId }) => {
      setTerminalModalState((current) => {
        if (!current || current.sessionId !== sessionId) {
          return current;
        }

        disposeSession(sessionId);
        return null;
      });
    });

    return () => {
      unsubscribeExit();
    };
  }, []);

  const handleTitleModalSave = useCallback(
    (title: string) => {
      if (!titleModalState) {
        return;
      }

      updateTabProperty(titleModalState.tabId, {
        title: title.length > 0 ? title : undefined,
      });

      setTitleModalState(null);
    },
    [titleModalState, updateTabProperty]
  );

  const handleWebViewUpdate = useCallback(
    (
      tabId: string,
      paneId: string,
      updates: {
        url?: string;
        title?: string;
      }
    ) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const pane = tab.panes[paneId];
          if (!pane || pane.type !== "webview") {
            return tab;
          }

          const nextPane = {
            ...pane,
            url: updates.url ?? pane.url,
            title: updates.title ?? pane.title,
          };

          if (nextPane.url === pane.url && nextPane.title === pane.title) {
            return tab;
          }

          return {
            ...tab,
            panes: {
              ...tab.panes,
              [paneId]: nextPane,
            },
          };
        })
      );
    },
    [setTabs]
  );

  const closePane = useCallback(
    (tabId: string, paneId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }

      if (Object.keys(tab.panes).length === 1) {
        closeTab(tabId);
        return;
      }

      removePane(tabId, paneId);
    },
    [tabs, closeTab, removePane]
  );

  const handleContextMenu = useContextMenu({
    closePane,
    setTitleModal: (tabId: string, value: string) => {
      setTitleModalState({ tabId, initialValue: value });
    },
    canChangeTitle: (tabId: string) => {
      if (tabs.length > 1) {
        return true;
      }

      if (tabs.length === 1) {
        return alwaysShowTabStrip;
      }

      return false;
    },
  });

  const runShellCommand = useCallback(
    async (
      rawCommand: string,
      options: { cwd?: string; trackHistory?: boolean } = {}
    ) => {
      const command = rawCommand.trim();
      if (command.length === 0) {
        return;
      }

      const api = window.conduit;
      if (!api) {
        return;
      }

      if (terminalModalState) {
        api.closeTerminal(terminalModalState.sessionId);
        disposeSession(terminalModalState.sessionId);
        setTerminalModalState(null);
      }

      const requestedCwd =
        typeof options.cwd === "string" && options.cwd.length > 0
          ? options.cwd
          : undefined;

      const result = await api.createTerminal(
        requestedCwd ? { cwd: requestedCwd } : undefined
      );
      if (!result) {
        return;
      }

      const commandWithNewline =
        command.endsWith("\n") || command.endsWith("\r")
          ? command
          : `${command}\n`;
      api.sendKeypress(result.sessionId, commandWithNewline);

      setTerminalModalState({
        sessionId: result.sessionId,
        cwd: result.cwd ?? requestedCwd ?? null,
        title: result.title,
        command,
      });

      if (options.trackHistory) {
        await recordCommandHistoryEntry(command);
      }
    },
    [recordCommandHistoryEntry, terminalModalState]
  );

  const handleShellCommand = useCallback(
    async (rawCommand: string) => {
      await runShellCommand(rawCommand, { trackHistory: true });
    },
    [runShellCommand]
  );

  const handleOpenWebPage = useCallback(
    (url: string) => {
      const activeTab = tabs.find((tab) => tab.isActive);
      if (!activeTab) {
        return;
      }

      const activePaneId = activeTab.activePaneId;
      if (!activePaneId) {
        return;
      }

      openWebViewPane(activeTab.id, activePaneId, url);
      setIsUrlDialogOpen(false);
    },
    [tabs]
  );

  const commandItems = useMemo<Command[]>(() => {
    const items: Command[] = [
      {
        id: "new-tab",
        label: "New Tab",
        description: "Create a new terminal tab",
        run: () => void openTab(),
      },
    ];

    const activeTab = tabs.find((tab) => tab.isActive);

    if (activeTab && activeTab.activePaneId) {
      items.push({
        id: "open-web-page",
        label: "Open web page",
        description: "Open a web page in a split view",
        run: () => setIsUrlDialogOpen(true),
      });
    }
    if (tabs.length > 1 && activeTab) {
      items.push({
        id: "close-tab",
        label: "Close Tab",
        description: "Close the currently active tab",
        run: () => closeTab(activeTab.id),
      });
    }

    if (activeTab && hasCustomLayout(activeTab.id)) {
      items.push({
        id: "reset-layout",
        label: "Reset layout",
        description: "Restore the default pane sizes for this tab",
        run: () => resetLayoutSizes(activeTab.id),
      });
    }

    const activePane =
      activeTab && activeTab.activePaneId
        ? activeTab.panes[activeTab.activePaneId]
        : undefined;

    if (activePane?.type === "terminal" && activePane.cwd) {
      const paneCwd = activePane.cwd;

      items.push({
        id: "open-in-vscode",
        label: "Open in VS Code",
        description: "Open the active directory in Visual Studio Code",
        run: async () => {
          const api = window.conduit;
          if (!api) {
            return;
          }

          await api.runBackgroundCommand({
            command: "code-insiders",
            args: [paneCwd],
            cwd: paneCwd,
          });
        },
      });
    }

    return items;
  }, [closeTab, hasCustomLayout, openTab, resetLayoutSizes, tabs]);

  const handleCloseTerminalModal = useCallback(() => {
    setTerminalModalState((current) => {
      if (!current) {
        return current;
      }

      const { sessionId } = current;
      const api = window.conduit;
      if (api) {
        api.closeTerminal(sessionId);
      }
      disposeSession(sessionId);
      return null;
    });
  }, []);

  const handleOpenModalAsTab = useCallback(() => {
    setTerminalModalState((current) => {
      if (!current) {
        return current;
      }

      openTabFromExistingSession({
        sessionId: current.sessionId,
        cwd: current.cwd,
        title: current.title,
      });

      return null;
    });
  }, []);

  const shouldShowTabStrip =
    tabs.length > 0 && (alwaysShowTabStrip || tabs.length > 1);

  const titleBarBg =
    shouldShowTabStrip && tabPosition === "top"
      ? "bg-surface-muted"
      : "bg-surface";

  return (
    <div className="flex-1 flex flex-col bg-inherit min-h-0 rounded-xl">
      <TitleBar backgroundClass={titleBarBg} />

      {shouldShowTabStrip && tabPosition === "top" && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}

      <TabLayout
        handleContextMenu={handleContextMenu}
        handleResizeStart={handleResizeStart}
        resizingNode={resizingNode}
        handleWebViewUpdate={handleWebViewUpdate}
      />

      {shouldShowTabStrip && tabPosition === "bottom" && (
        <TabStrip
          onOpenCommandPalette={openCommandPalette}
          onTabContextMenu={(e, tabId) => handleContextMenu(e, tabId)}
          position={tabPosition}
        />
      )}

      <TabTitleDialog
        isOpen={titleModalState !== null}
        initialValue={titleModalState?.initialValue ?? ""}
        onClose={() => setTitleModalState(null)}
        onSave={handleTitleModalSave}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commandItems={commandItems}
        onRunShellCommand={handleShellCommand}
        shellHistory={commandHistory}
        onRemoveShellHistoryEntry={removeCommandHistoryEntry}
      />

      {terminalModalState && (
        <TerminalDialog
          sessionId={terminalModalState.sessionId}
          cwd={terminalModalState.cwd}
          onClose={handleCloseTerminalModal}
          onOpenAsTab={handleOpenModalAsTab}
        />
      )}

      <UrlDialog
        isOpen={isUrlDialogOpen}
        onClose={() => setIsUrlDialogOpen(false)}
        onSubmit={handleOpenWebPage}
      />
    </div>
  );
}
