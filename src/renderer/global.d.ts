export {};

import type { WebviewTag } from "electron";
import type { DetailedHTMLProps, HTMLAttributes, RefAttributes } from "react";
import type { ConduitAPI } from "../preload";

declare module "*.mp3" {
  const src: string;
  export default src;
}

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
