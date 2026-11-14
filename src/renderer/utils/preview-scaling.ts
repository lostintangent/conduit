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
  if (scaling.isScaled) {
    element.style.width = `${scaling.targetWidth - 3}px`;
    element.style.height = `${scaling.targetHeight - 3}px`;
    element.style.transformOrigin = "top left";
    element.style.transform = `scale(${scaling.scaleX}, ${scaling.scaleY})`;
  } else {
    element.style.width = `${scaling.targetWidth}px`;
    element.style.height = `${scaling.targetHeight}px`;
    element.style.transformOrigin = "";
    element.style.transform = "";
  }
}
