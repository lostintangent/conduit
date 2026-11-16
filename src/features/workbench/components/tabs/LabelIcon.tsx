import type { PaneIcon } from "@features/workbench/model";
import { RunningIndicator } from "@/ui/running-indicator";

/**
 * The icon before a pane's label, as tall as its text. A template is drawn in
 * the text's color, so it shows on any tab, the active one's too. While a new
 * site's icon is loading, a spinner in the text's color holds its place, so
 * the label doesn't move when it comes.
 */
export function LabelIcon({ icon }: { icon: PaneIcon }) {
  if (icon === "loading") {
    return (
      <RunningIndicator
        data-page-icon="loading"
        className="size-3.5 flex-none"
      />
    );
  }

  return icon.template ? (
    <span
      aria-hidden
      data-page-icon="template"
      className="size-3.5 flex-none bg-current"
      style={{ maskImage: `url("${icon.src}")`, maskSize: "100% 100%" }}
    />
  ) : (
    <img
      alt=""
      data-page-icon="color"
      src={icon.src}
      draggable={false}
      className="size-3.5 flex-none"
    />
  );
}
