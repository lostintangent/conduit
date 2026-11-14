/**
 * Keeps MarkdownPreview out of the startup bundle. It brings streamdown, KaTeX
 * and the unified stack, about 845 KB that only Markdown files use. The
 * renderer entry preloads it once startup goes idle, and the component loads
 * it itself if it's shown before then.
 *
 * Not React.lazy: that always suspends on first render, and React holds a
 * Suspense boundary's content back until 300 ms after its fallback showed,
 * while the chunk itself loads in about 25 ms.
 */

import { useEffect, useState } from "react";
import type { MarkdownPreview, MarkdownPreviewProps } from "./MarkdownPreview";

let loaded: typeof MarkdownPreview | undefined;

/** Starts loading the preview, so it's ready by the time it's shown. */
export function preloadMarkdownPreview() {
  return import("./MarkdownPreview").then((m) => (loaded = m.MarkdownPreview));
}

export function LazyMarkdownPreview(props: MarkdownPreviewProps) {
  const [Preview, setPreview] = useState(() => loaded);

  useEffect(() => {
    if (!Preview)
      void preloadMarkdownPreview().then((p) => setPreview(() => p));
  }, [Preview]);

  return Preview ? <Preview {...props} /> : null;
}
