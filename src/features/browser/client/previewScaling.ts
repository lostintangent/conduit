/**
 * Utilities for scaling webviews in different contexts (layout panes and tab previews)
 */

const EPSILON = 0.001;

export interface ScalingDimensions {
  layoutWidth: number;
  layoutHeight: number;
  rectWidth: number;
  rectHeight: number;
}

export interface ScalingResult {
  scaleX: number;
  scaleY: number;
  isScaled: boolean;
  targetWidth: number;
  targetHeight: number;
}

/**
 * Calculate scale factors for a webview element
 *
 * @param dimensions - The dimensions and optional preview scale
 * @returns Scaling information including scale factors and whether scaling is applied
 */
export function calculateWebviewScale(
  dimensions: ScalingDimensions,
): ScalingResult {
  const { layoutWidth, layoutHeight, rectWidth, rectHeight } = dimensions;

  const scaleX = layoutWidth > 0 ? rectWidth / layoutWidth : 1;
  const scaleY = layoutHeight > 0 ? rectHeight / layoutHeight : 1;

  const targetWidth = layoutWidth || rectWidth;
  const targetHeight = layoutHeight || rectHeight;

  return {
    scaleX,
    scaleY,
    isScaled: Math.abs(scaleX - 1) > EPSILON || Math.abs(scaleY - 1) > EPSILON,
    targetWidth,
    targetHeight,
  };
}

/**
 * Apply scaling styles to a webview element
 *
 * @param element - The webview element to style
 * @param scaling - The scaling result from calculateWebviewScale
 */
export function applyWebviewScaling(
  element: HTMLElement,
  scaling: ScalingResult,
): void {
  // Scaled or not, the page keeps its pane's size, since laying a page out
  // again for another size can hold up the frame that shows it
  element.style.width = `${scaling.targetWidth}px`;
  element.style.height = `${scaling.targetHeight}px`;
  if (scaling.isScaled) {
    element.style.transformOrigin = "top left";
    element.style.transform = `scale(${scaling.scaleX}, ${scaling.scaleY})`;
  } else {
    element.style.transformOrigin = "";
    element.style.transform = "";
  }
}

/**
 * A clip-path that keeps an element shown over a tab's preview, like its
 * page, inside the rounded box the preview clips its own content to. The
 * element covers `rect` on screen, scaled by `scaleX` and `scaleY`, so the
 * clip is in its own unscaled pixels.
 */
export function clipToPreview(
  rect: DOMRect,
  preview: Element,
  scaleX = 1,
  scaleY = 1,
): string {
  const box = preview.getBoundingClientRect();
  const left = box.left + preview.clientLeft;
  const top = box.top + preview.clientTop;
  const right = left + preview.clientWidth;
  const bottom = top + preview.clientHeight;
  const insets = [
    Math.max(0, top - rect.top) / scaleY,
    Math.max(0, rect.right - right) / scaleX,
    Math.max(0, rect.bottom - bottom) / scaleY,
    Math.max(0, left - rect.left) / scaleX,
  ];

  // Only the corners it shares with the preview are rounded, as much as the
  // inside of the preview's border is
  const radius =
    Math.max(
      0,
      Number.parseFloat(getComputedStyle(preview).borderTopLeftRadius) -
        preview.clientLeft,
    ) / scaleX;
  const isAt = (edge: number, place: number) => Math.abs(edge - place) < 0.5;
  const atTop = isAt(Math.max(rect.top, top), top);
  const atRight = isAt(Math.min(rect.right, right), right);
  const atBottom = isAt(Math.min(rect.bottom, bottom), bottom);
  const atLeft = isAt(Math.max(rect.left, left), left);
  const corners = [
    atTop && atLeft,
    atTop && atRight,
    atBottom && atRight,
    atBottom && atLeft,
  ].map((isShared) => (isShared ? `${radius}px` : "0"));

  return `inset(${insets.map((inset) => `${inset}px`).join(" ")} round ${corners.join(" ")})`;
}
