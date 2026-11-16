import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import { type MenuEntry, useMenu } from "@/commands/hooks/useMenu";
import { MenuId } from "@/commands/menus/types";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { closeTab } from "@features/workbench/client/actions/tab";
import { quickTabsAtom } from "@features/workbench/client/atoms";
import { useTabContentPortal } from "@features/workbench/components/layout/normal/TabContentPortalContext";
import { shallow, useSelector } from "@tanstack/react-store";
import { useCallback, useLayoutEffect, useRef } from "react";
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
 * Dims and blurs the workbench once for the whole stack. It stays mounted so
 * it fades out too, while a closing pane goes at once with its content.
 *
 * Quick panes sit above the Hyper Terminal (z-70) and below dialogs (z-80),
 * so a dialog or the palette opened from one covers its page, which floats
 * just above its panel, see BrowserPane.
 */
function QuickBackdrop({ shown }: { shown: boolean }) {
  return createPortal(
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-[75] bg-black/30 backdrop-blur-sm transition-opacity duration-150 dark:bg-black/45 ${
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

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const content = useCallback(
    (element: HTMLDivElement | null) => {
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
        overlayClassName="z-[75] bg-transparent"
        aria-describedby={undefined}
        className="z-[75] flex h-[758px] max-h-[90vh] w-full max-w-[min(95vw,1000px)] flex-col gap-2 border-0 bg-transparent p-0 shadow-none duration-150 data-[state=open]:zoom-in-100!"
        // The pane takes focus itself once it's active
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Only an Escape the pane didn't use closes it, see `closeOnEscape`
        onEscapeKeyDown={(event) => event.preventDefault()}
        overlayRef={overlayRef}
        onPointerDownOutside={(event) => {
          // Only a click on its overlay is outside it. Anything else is in it
          // or layered over it, like what its tab's content shows on the
          // body, which Radix can't tell from outside since that content
          // isn't in the dialog's React tree.
          if (event.target !== overlayRef.current) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Quick Pane</DialogTitle>
        <div
          className={`flex shrink-0 justify-end ${isFront ? "" : "invisible"}`}
        >
          <QuickPaneToolbar />
        </div>
        <div
          ref={body}
          className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The front quick pane's buttons, which commands contribute to the
 * `QuickPane` menu, so they act on the front pane like their keys do
 */
function QuickPaneToolbar() {
  const items = useMenu(MenuId.QuickPane);
  return (
    <div
      role="toolbar"
      aria-label="Quick Pane"
      className="flex items-center rounded-full border border-border bg-elevated shadow-sm"
    >
      {items.map((item) => (
        <QuickPaneButton key={item.commandId} item={item} />
      ))}
    </div>
  );
}

function QuickPaneButton({ item }: { item: MenuEntry }) {
  const command = useCommand(item.commandId);
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={item.title}
          disabled={!item.enabled}
          onClick={() => void command.execute()}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {Icon && <Icon size={15} />}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {getCommandDisplayTitle({ ...command, title: item.title })}
      </TooltipContent>
    </Tooltip>
  );
}
