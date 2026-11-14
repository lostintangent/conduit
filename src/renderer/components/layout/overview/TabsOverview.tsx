import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { IdleIndicator } from "@/components/ui/idle-indicator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { closeTab, focusTab, openTab } from "@/store/actions/tab";
import { applicationModeAtom } from "@/store/atoms";
import { useSettings } from "@features/settings/client/queries";
import { tabLabelsAtom } from "@/store/tabLabels";
import { useSelector } from "@tanstack/react-store";
import { Lock, Minimize2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TabPreviewItem } from "./TabPreviewItem";

export function TabsOverview() {
  const tabLabels = useSelector(tabLabelsAtom);
  const showTabState = useSettings((s) => s.showTabState);
  const setApplicationMode = applicationModeAtom.set;

  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  return (
    <div className="relative flex flex-1 overflow-auto bg-background min-h-0">
      <div className="mx-auto flex w-full max-w-[90vw] flex-wrap gap-4 self-start px-6 py-8 justify-center">
        {tabLabels.map((tab) => (
          <div
            key={tab.id}
            className="flex flex-col items-center gap-2"
            onMouseEnter={() => setHoveredTabId(tab.id)}
            onMouseLeave={() => setHoveredTabId(null)}
            onFocus={() => setHoveredTabId(tab.id)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                setHoveredTabId(null);
              }
            }}
          >
            <TabPreviewItem
              tabId={tab.id}
              onClick={() => focusTab(tab.id)}
              size={{ width: 548, height: 343 }}
              isHovered={hoveredTabId === tab.id}
            />
            <div className="mx-auto flex items-center justify-center gap-4 px-1">
              <button
                type="button"
                onClick={() => focusTab(tab.id)}
                className="inline-flex items-center justify-center gap-1.5 truncate text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                title={tab.label}
              >
                {showTabState && <IdleIndicator tabState={tab.tabState} />}
                {showTabState && tab.tabState === "running" ? (
                  <AnimatedShinyText>{tab.label}</AnimatedShinyText>
                ) : (
                  tab.label
                )}
              </button>
              {tab.locked ? (
                <span
                  className="inline-flex items-center justify-center"
                  title="Tab is locked"
                  aria-label="Tab is locked"
                >
                  <Lock size={16} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  className="transition hover:text-destructive focus:outline-none"
                  aria-label="Close tab"
                  title="Close tab"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating action buttons */}
      <div className="pointer-events-none fixed bottom-3 right-3 z-[65] flex items-center">
        <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur pointer-events-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={() => openTab()}
                aria-label="New tab"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New tab (⌘T)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={() => setApplicationMode("normal")}
                aria-label="Exit tab overview"
              >
                <Minimize2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Exit tab overview</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
