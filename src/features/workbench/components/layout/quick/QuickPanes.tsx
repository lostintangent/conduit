import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { movePaneToHyperTerminal } from "@features/workbench/client/actions/hyperTerminal";
import {
  closeTab,
  openQuickTabInStrip,
} from "@features/workbench/client/actions/tab";
import { quickTabsAtom, tabsAtom } from "@features/workbench/client/atoms";
import { useTabContentPortal } from "@features/workbench/components/layout/normal/TabContentPortalContext";
import { ApplicationCommands } from "@shared/commands";
import { shallow, useSelector } from "@tanstack/react-store";
import { ArrowUpRight, PictureInPicture2, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shows each quick pane's tab in a dialog over the workbench, the last one
 * in front. A tab's content moves in rather than remounting, so it keeps its
 * state when it opens in the strip.
 */
export function QuickPanes() {
  const tabIds = useSelector(
    quickTabsAtom,
    (tabs) => tabs.map((tab) => tab.id),
    { compare: shallow },
  );
  return (
    <>
      <QuickBackdrop shown={tabIds.length > 0} />
      {tabIds.map((tabId, index) => (
        <QuickPane
          key={tabId}
          tabId={tabId}
          isFront={index === tabIds.length - 1}
        />
      ))}
    </>
  );
}

/**
 * Dims the workbench once for the whole stack. It stays mounted so it fades
 * out too, while a closing pane goes at once with its content.
 */
function QuickBackdrop({ shown }: { shown: boolean }) {
  return createPortal(
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-[80] bg-black/30 transition-opacity duration-150 dark:bg-black/45 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    />,
    document.body,
  );
}

function QuickPane({ tabId, isFront }: { tabId: string; isFront: boolean }) {
  const { showTabIn } = useTabContentPortal();
  // The provider's functions change on every render, and showing the tab
  // again would move its content out and back
  const showTabInRef = useRef(showTabIn);
  useLayoutEffect(() => {
    showTabInRef.current = showTabIn;
  });
  const body = useCallback(
    (element: HTMLDivElement) => showTabInRef.current(tabId, element),
    [tabId],
  );

  const contentRef = useRef<HTMLDivElement | null>(null);
  const content = useCallback(
    (element: HTMLDivElement | null) => {
      contentRef.current = element;
      if (!element) return;
      // Native, because the tab's content is a React child of the tab layout,
      // so its keys never reach a React handler here. Whatever used an Escape,
      // like Find or vim, stops it on its way up.
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.isComposing) return;
        event.stopPropagation();
        closeTab(tabId, { force: true });
      };
      element.addEventListener("keydown", closeOnEscape);
      return () => element.removeEventListener("keydown", closeOnEscape);
    },
    [tabId],
  );

  const terminalPaneId = useSelector(tabsAtom, (tabs) => {
    const tab = tabs.find((tab) => tab.id === tabId);
    const pane = tab?.panes[tab.activePaneId];
    return pane?.type === "terminal" ? pane.id : null;
  });
  const moveToTab = useCommand(ApplicationCommands.PANE_MOVE_TO_TAB);
  const close = useCommand(ApplicationCommands.TAB_CLOSE);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeTab(tabId, { force: true });
      }}
    >
      <DialogContent
        ref={content}
        data-quick-pane=""
        showClose={false}
        overlayClassName="bg-transparent"
        aria-describedby={undefined}
        className="flex h-[758px] max-h-[90vh] w-full max-w-[min(95vw,1000px)] flex-col gap-2 border-0 bg-transparent p-0 shadow-none duration-150 data-[state=open]:zoom-in-100!"
        // The pane takes focus itself once it's active
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Only an Escape the pane didn't use closes it, see `closeOnEscape`
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          // The tab's content isn't in the dialog's React tree, so Radix
          // takes a click in it as outside
          if (contentRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className="sr-only">Quick Pane</DialogTitle>
        <div
          className={`flex shrink-0 justify-end ${isFront ? "" : "invisible"}`}
        >
          <div
            role="toolbar"
            aria-label="Quick Pane"
            className="flex items-center rounded-full border border-border bg-elevated shadow-sm"
          >
            {terminalPaneId && (
              <QuickPaneButton
                label="Hyper Terminal"
                tooltip="Hyper Terminal"
                onClick={() => movePaneToHyperTerminal(tabId, terminalPaneId)}
              >
                <PictureInPicture2 size={15} />
              </QuickPaneButton>
            )}
            <QuickPaneButton
              label="Open in Tab"
              tooltip={getCommandDisplayTitle({
                title: "Open in Tab",
                primaryKeybinding: moveToTab.primaryKeybinding,
              })}
              onClick={() => openQuickTabInStrip(tabId)}
            >
              <ArrowUpRight size={15} />
            </QuickPaneButton>
            <QuickPaneButton
              label="Close"
              tooltip={getCommandDisplayTitle({
                title: "Close",
                primaryKeybinding: close.primaryKeybinding,
              })}
              onClick={() => closeTab(tabId, { force: true })}
            >
              <X size={15} />
            </QuickPaneButton>
          </div>
        </div>
        <div
          ref={body}
          className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
        />
      </DialogContent>
    </Dialog>
  );
}

function QuickPaneButton({
  label,
  tooltip,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
