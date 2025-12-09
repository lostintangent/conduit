import { App } from "@/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { userSettingsAtom } from "@/store/atoms";
import { useAtomValue } from "jotai";
import { createRoot } from "react-dom/client";
import { cn } from "./utils";

import "./index.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

const api = window.conduit;
// On Windows, we use native frame so no CSS rounded corners
const isWindows = api.platform === "win32";

function AppWrapper() {
  const { useGradientBorders } = useAtomValue(userSettingsAtom);

  // Use rounded corners only on macOS/Linux where we have transparent frameless window
  const roundedClass = isWindows ? "" : "rounded-xl";

  return (
    <TooltipProvider delayDuration={200}>
      {/* Gradient canvas technique - creates synchronized animated borders */}
      <div className={`relative w-full h-full overflow-hidden ${roundedClass}`}>
        {/* Animated gradient canvas - sits behind everything */}
        <div className="gradient-canvas z-0" />

        {/* Muting overlay - dims gradient or provides solid color for inner borders */}
        <div
          className={cn(
            `absolute inset-[3px] pointer-events-none ${roundedClass}`,
            useGradientBorders ? "bg-pane-divider-gradient" : "bg-pane-divider",
          )}
        />

        {/* Content layer - inset creates the outer border effect */}
        {/* No background here - let gradient show through gaps */}
        {/* No z-index to allow webviews (z-1 on body) to render on top */}
        <div
          className={`absolute inset-[3px] flex flex-col overflow-hidden ${roundedClass}`}
        >
          <App />
        </div>
      </div>
    </TooltipProvider>
  );
}

root.render(<AppWrapper />);
