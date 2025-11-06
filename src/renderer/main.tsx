import { App } from "@/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { userSettingsAtom } from "@/store/atoms";
import { useAtomValue } from "jotai";
import { createRoot } from "react-dom/client";

import "./index.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

function AppWrapper() {
  const { useGradientBorders } = useAtomValue(userSettingsAtom);

  // When gradient borders are enabled: transparent overlay shows dimmed gradient
  // When disabled: solid overlay creates uniform border color
  const overlayClass = useGradientBorders ? "bg-black/60" : "bg-gray-700";

  return (
    <TooltipProvider delayDuration={200}>
      {/* Gradient canvas technique - creates synchronized animated borders */}
      <div className="relative w-full h-full rounded-xl overflow-hidden">
        {/* Animated gradient canvas - sits behind everything */}
        <div className="gradient-canvas z-0" />

        {/* Muting overlay - dims gradient or provides solid color for inner borders */}
        <div className={`absolute inset-[3px] rounded-xl pointer-events-none ${overlayClass}`} />

        {/* Content layer - inset creates the outer border effect */}
        {/* No background here - let gradient show through gaps */}
        {/* No z-index to allow webviews (z-1 on body) to render on top */}
        <div className="absolute inset-[3px] flex flex-col rounded-xl overflow-hidden">
          <App />
        </div>
      </div>
    </TooltipProvider>
  );
}

root.render(<AppWrapper />);
