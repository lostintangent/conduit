import { App } from "@/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createRoot } from "react-dom/client";

import "./index.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <TooltipProvider delayDuration={200}>
    {/* Gradient canvas technique - creates synchronized animated borders */}
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      {/* Animated gradient canvas - sits behind everything */}
      <div className="gradient-canvas z-0" />

      {/* Muting overlay - dims the gradient for inner borders */}
      <div className="absolute inset-[3px] rounded-xl bg-black/60 pointer-events-none" />

      {/* Content layer - inset creates the outer border effect */}
      {/* No background here - let gradient show through gaps */}
      {/* No z-index to allow webviews (z-1 on body) to render on top */}
      <div className="absolute inset-[3px] flex flex-col rounded-xl overflow-hidden">
        <App />
      </div>
    </div>
  </TooltipProvider>,
);
