import { createRoot } from "react-dom/client";
import { App } from "@/app";

import "./index.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  /* Animated gradient border effect */
  <div className="flex w-full h-full gradient-border-animated p-[3px] rounded-xl">
    <div className="flex flex-col w-full h-full bg-surface rounded-xl">
      <App />
    </div>
  </div>,
);
