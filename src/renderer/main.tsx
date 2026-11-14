import { App } from "@/app";
import { installGitQueryBridge } from "@/api/gitQueries";
import { preloadMarkdownPreview } from "@/components/panes/editor/components/EditorPane/LazyMarkdownPreview";
import { TooltipProvider } from "@/components/ui/tooltip";
import { userSettingsAtom } from "@/store/atoms";
import { QueryClientProvider } from "@tanstack/react-query";
import { enableMapSet } from "immer";
import { useSelector } from "@tanstack/react-store";
import { createRoot } from "react-dom/client";
import { queryClient } from "./query";
import { cn } from "./utils";

// Enable Immer's Map and Set support for produce() on Map-valued atoms
enableMapSet();

import "./index.css";

installGitQueryBridge(queryClient);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
const root = createRoot(rootElement);

function AppWrapper() {
  const { useGradientBorders } = useSelector(userSettingsAtom);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Gradient canvas technique - creates synchronized animated borders */}
      <div className="relative w-full h-full overflow-hidden rounded-[18px]">
        {/* Animated gradient canvas - sits behind everything */}
        <div
          className={cn(
            "gradient-canvas z-0",
            !useGradientBorders && "gradient-canvas-muted",
          )}
        />

        {/* Muting overlay - dims gradient or provides solid color for inner borders */}
        <div
          className={cn(
            "absolute inset-[2px] pointer-events-none rounded-[18px]",
            useGradientBorders ? "bg-pane-divider-gradient" : "bg-pane-divider",
          )}
        />

        {/* Content layer - inset creates the outer border effect */}
        {/* No background here - let gradient show through gaps */}
        {/* No z-index to allow webviews (z-1 on body) to render on top */}
        <div className="absolute inset-[2px] flex flex-col overflow-hidden rounded-[18px]">
          <App />
        </div>
      </div>
    </TooltipProvider>
  );
}

root.render(
  <QueryClientProvider client={queryClient}>
    <AppWrapper />
  </QueryClientProvider>,
);

// The Markdown preview stays out of the startup bundle. Load it once startup
// has gone idle, so opening a Markdown file never waits on it
requestIdleCallback(() => void preloadMarkdownPreview());
