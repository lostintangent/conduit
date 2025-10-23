import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  DidNavigateEvent,
  DidNavigateInPageEvent,
  PageTitleUpdatedEvent,
  WebviewTag,
  ContextMenuParams,
} from "electron";

type WebPaneProps = {
  url: string;
  onTitleChange?: (title: string) => void;
  disableInteraction?: boolean;
  onContextMenu?: (coords: { clientX: number; clientY: number }) => void;
};

export function WebPane({
  url,
  onTitleChange,
  disableInteraction = false,
  onContextMenu,
}: WebPaneProps) {
  const webviewRef = useRef<WebviewTag | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const webview = webviewRef.current;

    const handleStopLoading = () => setIsLoading(false);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-finish-load", handleStopLoading);

    const notifyTitleChange = (event: PageTitleUpdatedEvent) =>
      onTitleChange(event.title);
    webview.addEventListener("page-title-updated", notifyTitleChange);

    const handleWebViewContextMenu = (
      event: Event & { params?: ContextMenuParams }
    ) => {
      event.preventDefault();

      const { left, top } = webview.getBoundingClientRect();
      const { x, y } = event.params;

      onContextMenu({
        clientX: left + x,
        clientY: top + y,
      });
    };
    
    webview.addEventListener("context-menu", handleWebViewContextMenu);

    return () => {
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-finish-load", handleStopLoading);

      webview.removeEventListener("page-title-updated", notifyTitleChange);
      webview.removeEventListener("context-menu", handleWebViewContextMenu);
    };
  }, []);

  return (
    <div className="relative flex flex-1 w-full h-full min-w-0 min-h-0">
      <webview
        ref={webviewRef}
        className="flex-1 w-full h-full min-w-0 min-h-0 border-0 bg-white/[0.02]"
        style={disableInteraction ? { pointerEvents: "none" } : undefined}
        src={url}
      />
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
        </div>
      )}
    </div>
  );
}
