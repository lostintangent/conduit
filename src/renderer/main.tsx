import { createRoot } from "react-dom/client";
import { App } from "@/app";

import "./index.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  /* Gradient border effect */
  <div className="flex w-full h-full bg-gradient-to-r from-green-400 to-purple-600 p-[3px] rounded-xl">
    <div className="flex flex-col w-full h-full bg-surface rounded-xl">
      <App />
    </div>
  </div>
);
