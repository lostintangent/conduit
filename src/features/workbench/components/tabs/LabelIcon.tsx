import type { PageIcon } from "@shared/types/panes";

/**
 * The icon before a pane's label, as tall as its text. A template is drawn in
 * the text's color, so it shows on any tab, the active one's too.
 */
export function LabelIcon({ icon }: { icon: PageIcon }) {
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
