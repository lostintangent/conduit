/// <reference types="vite/client" />

import type { WebviewTag } from "electron";
import type { DetailedHTMLProps, HTMLAttributes, RefAttributes } from "react";
import type { ConduitAPI } from "../preload";

declare global {
  interface Window {
    conduit: ConduitAPI;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> &
        RefAttributes<WebviewTag>;
    }
  }
}
