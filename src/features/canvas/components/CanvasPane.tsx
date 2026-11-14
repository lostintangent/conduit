import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { useImageDrop } from "@/hooks/useImageDrop";
import { useOnHide } from "@/hooks/useOnHide";
import { DEFAULT_CANVAS_STATE } from "@features/canvas/client/canvasStore";
import { resolveColor, watchAppTheme } from "@/utils/theme";
import type { CanvasPane as CanvasPaneType } from "@shared/types";
import type {
  CanvasElement,
  CanvasTool,
  FillStyle,
  Point,
  Rect,
  ShapeType,
  StrokePoint,
  Transform,
} from "@features/canvas/model";
import {
  createImageElement,
  createShapeElement,
  createStrokeElement,
  createTextElement,
  generateElementId,
} from "@features/canvas/model";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ElementStyle,
  Position,
  ShapeSize,
} from "./history/canvasHistory";
import { useCanvasHistory } from "./history/useCanvasHistory";
import { useCanvasState } from "./hooks/useCanvasState";
import { useViewport } from "./hooks/useViewport";
import { renderDotGrid } from "./render/dotGrid";
import {
  applyStrokeStyle,
  calculateArrowHead,
  calculateElementsBoundingBox,
  getElementBounds,
  renderAllElements,
  renderLineEndpointHandles,
  renderSelectionBox,
  renderSelectionHandles,
} from "./render/elements";
import { CanvasToolbar } from "./toolbar/CanvasToolbar";
import {
  getElementsInRect,
  getHandleAtPoint,
  hitTestElements,
} from "./utils/hitTest";
import {
  type HandleType,
  calculateResizeScale,
  calculateRotation,
  getCursorForHandle,
} from "./utils/transformUtils";

// =============================================================================
// Types
// =============================================================================

type CanvasPaneProps = {
  pane: CanvasPaneType;
  paneId: string;
  tabId?: string;
  onContextMenu: (coords: { clientX: number; clientY: number }) => void;
  /** Whether this is the active pane of the active tab */
  isActive?: boolean;
};

// =============================================================================
// Constants
// =============================================================================

// System font stack for consistent rendering between input and canvas
const FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Offset to position the text input overlay so it aligns with where the user clicked.
// These values position the input so the text content visually starts at the click point.
const TEXT_INPUT_OFFSET = { x: -5, y: -12 };

// Offset from click point to where text actually appears in the input (in canvas coords).
// This accounts for the input's border (1px) + padding (px-1 = 4px) = 5px horizontal,
// and the vertical text positioning within the input.
// These offsets ensure the committed text appears at the same position as the input text.
const TEXT_CONTENT_OFFSET = { x: 0, y: -6 };

// Default tool settings
const DEFAULT_STROKE_WIDTH = 4;
const DEFAULT_FONT_SIZE = 16;

// Minimum size threshold for committing a shape (prevents accidental tiny shapes)
const MIN_SHAPE_COMMIT_SIZE = 5;

// Offset when pasting elements so they don't overlap the original
const PASTE_OFFSET = 20;

// Duration to show the copy success indicator (ms)
const COPY_SUCCESS_DURATION_MS = 2000;

// Delay before focusing text input to ensure DOM is ready (ms)
const TEXT_INPUT_FOCUS_DELAY_MS = 10;

// =============================================================================
// Helpers
// =============================================================================

const _api = window.conduit;

/**
 * Get theme-aware background color using the same approach as terminal pane.
 * Uses resolveColor which reads from CSS custom properties.
 */
function getThemeBackgroundColor(): string {
  return resolveColor("background") || "#1a1a1a";
}

/**
 * Get theme-aware foreground color for the pen.
 */
function getThemeForegroundColor(): string {
  return resolveColor("foreground") || "#ffffff";
}

/** Convert a File/Blob to base64 data URL */
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Load an image and get its dimensions */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// =============================================================================
// Main Component
// =============================================================================

export const CanvasPane = memo(function CanvasPane({
  pane: _pane,
  paneId,
  tabId: _tabId,
  onContextMenu,
  isActive = false,
}: CanvasPaneProps) {
  // Refs
  const paneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Current stroke being drawn (accumulated points before committing)
  const currentStrokeRef = useRef<StrokePoint[]>([]);

  // Drag state for moving elements
  const dragStartRef = useRef<Point | null>(null);
  const dragElementStartPositions = useRef<Map<string, Point>>(new Map());

  // Resize/rotate state
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HandleType | null>(null);
  const resizeStartRef = useRef<{
    bounds: { width: number; height: number };
    scale: { scaleX: number; scaleY: number };
    rotation: number;
  } | null>(null);

  // For undo/redo: track the transform at the start of a resize/rotate operation
  const transformBeforeRef = useRef<Transform | null>(null);

  // For line endpoint dragging: track both transform and size for undo/redo
  const lineEndpointBeforeRef = useRef<{
    transform: Transform;
    size: { width: number; height: number };
  } | null>(null);

  // Canvas state from global store
  const {
    elements,
    selectedIds,
    backgroundColor,
    showDotGrid,
    addElement,
    updateElement,
    deleteElements,
    deleteSelectedElements,
    selectElements,
    clearSelection,
    clearCanvas,
    setBackgroundColor,
    toggleDotGrid,
    setElements,
    addElementsAtIndices,
    updateElementPosition,
    updateElementStyle,
  } = useCanvasState(paneId);

  // Operations for undo/redo (memoized to prevent hook recreation)
  const historyOperations = useMemo(
    () => ({
      addElement,
      deleteElements,
      updateElementPosition,
      updateElementTransform: (id: string, transform: Transform) =>
        updateElement(id, { transform }),
      updateElementStyle,
      setElements,
      addElementsAtIndices,
      clearCanvas,
      updateLineEndpoint: (id: string, transform: Transform, size: ShapeSize) =>
        updateElement(id, { transform, size }),
    }),
    [
      addElement,
      deleteElements,
      updateElementPosition,
      updateElement,
      updateElementStyle,
      setElements,
      addElementsAtIndices,
      clearCanvas,
    ],
  );

  // Undo/redo history
  const {
    canUndo,
    canRedo,
    recordAdd,
    recordDelete,
    recordMove,
    recordTransform,
    recordStyle,
    recordClear,
    recordLineEndpoint,
    undo,
    redo,
  } = useCanvasHistory({ paneId, operations: historyOperations });

  // Local UI state
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Marquee selection state
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const marqueeStartRef = useRef<Point | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const preMarqueeSelectionRef = useRef<string[]>([]); // For Shift+drag additive mode

  // Get device pixel ratio for crisp rendering on high-DPI displays
  const dpr = window.devicePixelRatio || 1;

  // Viewport state (zoom and pan)
  const {
    viewport,
    screenToCanvas,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomToFit,
    panBy,
    handleWheel,
  } = useViewport(paneId);

  // Wrap zoomToFit with bounds calculation
  const handleZoomToFit = useCallback(() => {
    const bounds = calculateElementsBoundingBox(elements);
    zoomToFit(bounds, canvasSize.width, canvasSize.height);
  }, [elements, canvasSize, zoomToFit]);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  // Tool state
  const [tool, setToolInternal] = useState<CanvasTool>("pen");
  const [strokeColor, setStrokeColor] = useState(getThemeForegroundColor);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fill, setFill] = useState<FillStyle | undefined>(undefined);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const copySuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Wrap setTool to clear selection when switching tools
  const setTool = useCallback(
    (newTool: CanvasTool) => {
      if (newTool !== tool) {
        clearSelection();
      }
      setToolInternal(newTool);
    },
    [tool, clearSelection],
  );

  // Shared handler for adding an image to the canvas (used by both paste and drop)
  const addImageToCanvas = useCallback(
    async (file: File) => {
      try {
        const dataUrl = await fileToBase64(file);
        const img = await loadImage(dataUrl);

        const imageElement = createImageElement(
          dataUrl.split(",")[1],
          file.type,
          { width: img.width, height: img.height },
          canvasSize.width / 2 / viewport.zoom - viewport.panX,
          canvasSize.height / 2 / viewport.zoom - viewport.panY,
        );

        addElement(imageElement);
        recordAdd([imageElement]);
        selectElements([imageElement.id]);
        setToolInternal("select");
      } catch (err) {
        console.error("Failed to add image to canvas:", err);
      }
    },
    [canvasSize, viewport, addElement, recordAdd, selectElements],
  );

  // Image drag and drop
  const { isImageDragOver, dragHandlers: imageDragHandlers } = useImageDrop({
    onImageDrop: addImageToCanvas,
  });

  // Text input state
  const [isAddingText, setIsAddingText] = useState(false);
  const [textPosition, setTextPosition] = useState<Point>({ x: 0, y: 0 });
  const [textInputReady, setTextInputReady] = useState(false);

  // Shape tool state
  const [shapeType, setShapeType] = useState<ShapeType>("rectangle");
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const shapeStartRef = useRef<Point | null>(null);
  const [shapePreview, setShapePreview] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number; // For lines/arrows - angle in degrees
  } | null>(null);

  // Cursor preview for pen/eraser tools. We update the DOM directly (rather than via React
  // state) to avoid triggering expensive re-renders of large canvases on every mouse move.
  const cursorPreviewRef = useRef<HTMLDivElement>(null);
  const updateCursorPreview = useCallback(
    (screenX?: number, screenY?: number) => {
      const el = cursorPreviewRef.current;
      if (!el) return;

      const shouldShow =
        screenX !== undefined &&
        screenY !== undefined &&
        (tool === "pen" || tool === "eraser") &&
        !isPanning &&
        !isSpacePressed;

      if (!shouldShow) {
        el.style.display = "none";
        return;
      }

      const size = strokeWidth * viewport.zoom;
      el.style.left = `${screenX - size / 2}px`;
      el.style.top = `${screenY - size / 2}px`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderColor =
        tool === "eraser" ? "rgba(128, 128, 128, 0.8)" : strokeColor;
      el.style.backgroundColor =
        tool === "eraser" ? "rgba(128, 128, 128, 0.2)" : "";
      el.style.display = "block";
    },
    [tool, isPanning, isSpacePressed, strokeWidth, strokeColor, viewport.zoom],
  );

  // Track if hovering over an element (for cursor feedback)
  const [isHoveringElement, setIsHoveringElement] = useState(false);

  // ---------------------------------------------------------------------------
  // Initialize background color from theme
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (backgroundColor === DEFAULT_CANVAS_STATE.backgroundColor) {
      setBackgroundColor(getThemeBackgroundColor());
    }
  }, [backgroundColor, setBackgroundColor]);

  // ---------------------------------------------------------------------------
  // Track container size
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setCanvasSize({
          width: Math.floor(width),
          height: Math.floor(height),
        });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Render canvas (called when elements, viewport, or size changes)
  // ---------------------------------------------------------------------------
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset transform to identity and clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Initialize canvas state to known defaults
    // This ensures we don't rely on browser defaults or residual state
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.setLineDash([]);

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply viewport transform with DPR scaling
    ctx.setTransform(
      dpr * viewport.zoom,
      0,
      0,
      dpr * viewport.zoom,
      viewport.panX * dpr * viewport.zoom,
      viewport.panY * dpr * viewport.zoom,
    );

    // Render dot grid if enabled
    if (showDotGrid) {
      renderDotGrid(ctx, viewport, backgroundColor, canvasSize);
    }

    // Render all elements (pass zoom for sharp pattern rendering)
    renderAllElements(ctx, elements, viewport.zoom);

    // Render selection indicators for selected elements
    // Note: Selection render functions are self-contained and set their own composite operation
    // Single selection: show interactive resize/rotate handles or endpoint handles
    // Multi-selection: show simple selection box (handles don't work for multi-select)
    const isSingleSelection = selectedIds.length === 1;
    for (const id of selectedIds) {
      const element = elements.find((el) => el.id === id);
      if (element) {
        if (isSingleSelection) {
          // Lines and arrows get endpoint handles, everything else gets box handles
          if (
            element.type === "shape" &&
            (element.shapeType === "line" || element.shapeType === "arrow")
          ) {
            renderLineEndpointHandles(ctx, element, viewport.zoom);
          } else {
            renderSelectionHandles(ctx, element, viewport.zoom);
          }
        } else {
          renderSelectionBox(ctx, element);
        }
      }
    }

    // Render current stroke being drawn (not yet committed)
    if (currentStrokeRef.current.length > 1) {
      ctx.beginPath();
      ctx.moveTo(currentStrokeRef.current[0].x, currentStrokeRef.current[0].y);
      for (let i = 1; i < currentStrokeRef.current.length; i++) {
        ctx.lineTo(
          currentStrokeRef.current[i].x,
          currentStrokeRef.current[i].y,
        );
      }

      // Apply stroke style (reuses logic from renderStroke)
      applyStrokeStyle(ctx, tool === "eraser", strokeColor);

      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Reset composite operation to ensure clean state for any subsequent operations
      ctx.globalCompositeOperation = "source-over";
    }
  }, [
    backgroundColor,
    canvasSize,
    dpr,
    viewport,
    elements,
    selectedIds,
    showDotGrid,
    tool,
    strokeColor,
    strokeWidth,
  ]);

  // ---------------------------------------------------------------------------
  // Sync canvas when dependencies change
  // ---------------------------------------------------------------------------
  // canvasSize is an intentional trigger
  useLayoutEffect(() => {
    renderCanvas();
  }, [canvasSize, renderCanvas]);

  // ---------------------------------------------------------------------------
  // Watch for theme changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let themeForeground = getThemeForegroundColor();
    return watchAppTheme(() => {
      const previousForeground = themeForeground;
      themeForeground = getThemeForegroundColor();
      setBackgroundColor(getThemeBackgroundColor());
      // Keep the pen on the theme's foreground unless the user picked a color
      setStrokeColor((current) =>
        current === previousForeground ? themeForeground : current,
      );
    });
  }, [setBackgroundColor]);

  // ---------------------------------------------------------------------------
  // Reset interaction - clears a drawing/dragging operation without committing
  // ---------------------------------------------------------------------------
  const resetInteraction = useCallback(() => {
    currentStrokeRef.current = [];
    setIsDrawing(false);
    setIsDragging(false);
    setActiveHandle(null);
    setIsDrawingShape(false);
    setShapePreview(null);
    shapeStartRef.current = null;
    dragStartRef.current = null;
    dragElementStartPositions.current.clear();
    resizeStartRef.current = null;
    transformBeforeRef.current = null;
    lineEndpointBeforeRef.current = null;

    // Reset marquee selection state (selection is already live, just clear the visual)
    setIsMarqueeSelecting(false);
    setMarqueeRect(null);
    marqueeStartRef.current = null;
    preMarqueeSelectionRef.current = [];
  }, []);

  // ---------------------------------------------------------------------------
  // Commit interaction - shared logic for completing drawing/dragging operations
  // ---------------------------------------------------------------------------
  const commitInteraction = useCallback(() => {
    // Commit current stroke if drawing
    if (isDrawing && currentStrokeRef.current.length > 1) {
      const stroke = createStrokeElement(
        currentStrokeRef.current,
        { color: strokeColor, width: strokeWidth },
        tool === "eraser",
      );
      addElement(stroke);
      recordAdd([stroke]);
    }

    // Commit shape if drawing
    if (
      isDrawingShape &&
      shapePreview &&
      shapePreview.width > MIN_SHAPE_COMMIT_SIZE
    ) {
      const isLinear = shapeType === "line" || shapeType === "arrow";
      const shape = createShapeElement(
        shapeType,
        shapePreview.x,
        shapePreview.y,
        shapePreview.width,
        isLinear ? shapePreview.width : shapePreview.height,
        {
          color: strokeColor,
          width: strokeWidth,
          // Only include fill for fillable shapes (not lines/arrows)
          fill: isLinear ? undefined : fill,
        },
        shapePreview.rotation ?? 0,
      );
      addElement(shape);
      recordAdd([shape]);
    }

    // Record move operation if we were dragging
    if (isDragging && dragElementStartPositions.current.size > 0) {
      const moves = new Map<string, { before: Position; after: Position }>();
      for (const [id, before] of dragElementStartPositions.current) {
        const el = elements.find((e) => e.id === id);
        if (el) {
          moves.set(id, {
            before,
            after: { x: el.transform.x, y: el.transform.y },
          });
        }
      }
      recordMove(moves);
    }

    // Record transform operation if we were resizing/rotating
    if (activeHandle && selectedIds.length === 1) {
      const el = elements.find((e) => e.id === selectedIds[0]);
      if (el) {
        // Line endpoint dragging changes both transform and size atomically
        if (
          (activeHandle === "line-start" || activeHandle === "line-end") &&
          lineEndpointBeforeRef.current
        ) {
          const before = lineEndpointBeforeRef.current;
          if (el.type === "shape") {
            recordLineEndpoint(el.id, before, {
              transform: el.transform,
              size: el.size,
            });
          }
        } else if (transformBeforeRef.current) {
          recordTransform(el.id, transformBeforeRef.current, el.transform);
        }
      }
    }

    resetInteraction();
  }, [
    isDrawing,
    isDragging,
    isDrawingShape,
    shapePreview,
    activeHandle,
    selectedIds,
    elements,
    tool,
    shapeType,
    strokeColor,
    strokeWidth,
    fill,
    addElement,
    recordAdd,
    recordMove,
    recordTransform,
    recordLineEndpoint,
    resetInteraction,
  ]);

  // ---------------------------------------------------------------------------
  // Handle mouse up outside canvas (important for good UX)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      commitInteraction();
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [commitInteraction, isPanning]);

  // A hidden tab gets no mouseup or keyup, so drop a gesture in progress
  // rather than let it follow the pointer when the tab returns. It isn't
  // committed, because unmounting runs this too, after the canvas is deleted.
  useOnHide(() => {
    resetInteraction();
    setIsPanning(false);
    panStartRef.current = null;
    setIsSpacePressed(false);
  });

  // ---------------------------------------------------------------------------
  // Clipboard operations
  // ---------------------------------------------------------------------------

  // Show copy success checkmark for 2 seconds
  const triggerCopySuccess = useCallback(() => {
    if (copySuccessTimeoutRef.current) {
      clearTimeout(copySuccessTimeoutRef.current);
    }
    setShowCopySuccess(true);
    // Not cleared on unmount, so it still runs while the tab is hidden, since
    // a hidden tab keeps its state.
    copySuccessTimeoutRef.current = setTimeout(() => {
      setShowCopySuccess(false);
    }, COPY_SUCCESS_DURATION_MS);
  }, []);

  const handleCopyToClipboard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create export canvas at current view size
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvasSize.width * dpr;
    exportCanvas.height = canvasSize.height * dpr;

    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Apply DPR scaling (but not viewport transform for clean export)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Render all elements at their actual positions
    renderAllElements(ctx, elements);

    // Convert to blob and write to clipboard
    return new Promise<void>((resolve) => {
      exportCanvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          triggerCopySuccess();
        }
        resolve();
      }, "image/png");
    });
  }, [canvasSize, dpr, backgroundColor, elements, triggerCopySuccess]);

  const handleCopyElements = useCallback(async () => {
    const selectedElements = elements.filter((el) =>
      selectedIds.includes(el.id),
    );
    if (selectedElements.length === 0) return;

    // Wrap elements with a marker so we can identify canvas data on paste
    const clipboardData = JSON.stringify({
      type: "conduit-canvas-elements",
      elements: selectedElements,
    });

    // Use writeText for broader compatibility
    await navigator.clipboard.writeText(clipboardData);
  }, [elements, selectedIds]);

  // ---------------------------------------------------------------------------
  // Keyboard handlers (attached to container, not window)
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Space for panning
      if (e.code === "Space" && !isAddingText) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y for redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
        (e.ctrlKey && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
      // Ctrl+C or Cmd+C to copy selected elements or canvas
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        if (selectedIds.length > 0) {
          // Copy selected elements as JSON
          handleCopyElements();
        } else {
          // Copy entire canvas as image
          handleCopyToClipboard();
        }
      }
      // Ctrl+0 or Cmd+0 for zoom to fit
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        handleZoomToFit();
      }
      // Delete or Backspace to delete selected elements
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isAddingText &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        const selectedElements = elements.filter((el) =>
          selectedIds.includes(el.id),
        );
        recordDelete(selectedElements, elements);
        deleteSelectedElements();
      }
      // Escape to clear selection or cancel text input
      if (e.key === "Escape") {
        if (isAddingText) {
          setIsAddingText(false);
        } else {
          clearSelection();
        }
      }
    },
    [
      isAddingText,
      handleZoomToFit,
      handleCopyToClipboard,
      handleCopyElements,
      selectedIds,
      elements,
      deleteSelectedElements,
      clearSelection,
      undo,
      redo,
      recordDelete,
    ],
  );

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.code === "Space") {
      setIsSpacePressed(false);
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, []);

  // Space's keyup goes wherever focus went, so release it when focus leaves.
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsSpacePressed(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Focus text input when it appears
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAddingText && textInputRef.current) {
      const timeoutId = setTimeout(() => {
        textInputRef.current?.focus();
        setTextInputReady(true);
      }, TEXT_INPUT_FOCUS_DELAY_MS);
      return () => clearTimeout(timeoutId);
    }
    setTextInputReady(false);
  }, [isAddingText]);

  // Paste canvas elements from JSON clipboard data
  const pasteElements = useCallback(
    (text: string) => {
      try {
        const data = JSON.parse(text);
        if (data?.type !== "conduit-canvas-elements") return;
        if (!Array.isArray(data.elements)) return;

        const newElements = data.elements.map((el: CanvasElement) => ({
          ...el,
          id: generateElementId(),
          transform: {
            ...el.transform,
            x: el.transform.x + PASTE_OFFSET,
            y: el.transform.y + PASTE_OFFSET,
          },
        })) as CanvasElement[];

        for (const element of newElements) {
          addElement(element);
        }
        recordAdd(newElements);
        selectElements(newElements.map((el) => el.id));
      } catch {
        // Not valid canvas element data - ignore
      }
    },
    [addElement, recordAdd, selectElements],
  );

  // ---------------------------------------------------------------------------
  // Paste handler for images and elements (attached to container, not window)
  // ---------------------------------------------------------------------------
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);

      // Priority: image > elements
      const imageItem = items.find((item) => item.type.startsWith("image/"));

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (!file) return;

        e.preventDefault();
        addImageToCanvas(file);
      } else {
        const text = e.clipboardData?.getData("text/plain");
        if (text) pasteElements(text);
      }
    },
    [addImageToCanvas, pasteElements],
  );

  // ---------------------------------------------------------------------------
  // Get canvas point from mouse event (applies viewport transform)
  // ---------------------------------------------------------------------------
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return screenToCanvas(e.clientX, e.clientY, rect);
    },
    [screenToCanvas],
  );

  // ---------------------------------------------------------------------------
  // Get screen point from canvas coordinates (for UI positioning)
  // ---------------------------------------------------------------------------
  const canvasToScreenPoint = useCallback(
    (canvasX: number, canvasY: number): Point => {
      return {
        x: (canvasX + viewport.panX) * viewport.zoom,
        y: (canvasY + viewport.panY) * viewport.zoom,
      };
    },
    [viewport],
  );

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click, Space+click, or hand tool starts panning
      if (
        e.button === 1 ||
        (e.button === 0 && isSpacePressed) ||
        (e.button === 0 && tool === "hand")
      ) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button !== 0) return; // Only left click

      const point = getCanvasPoint(e);
      if (!point) return;

      // Handle based on tool
      switch (tool) {
        case "select": {
          // First, check if we clicked on a handle of an already-selected element
          if (selectedIds.length === 1) {
            const selectedElement = elements.find(
              (el) => el.id === selectedIds[0],
            );
            if (selectedElement) {
              const handle = getHandleAtPoint(
                point,
                selectedElement,
                viewport.zoom,
              );
              if (handle && handle !== "move") {
                // Start resize, rotate, or line endpoint drag
                setActiveHandle(handle);
                dragStartRef.current = point;
                resizeStartRef.current = {
                  bounds: getElementBounds(selectedElement),
                  scale: {
                    scaleX: selectedElement.transform.scaleX,
                    scaleY: selectedElement.transform.scaleY,
                  },
                  rotation: selectedElement.transform.rotation,
                };
                // Save state for undo - for line endpoints, save size too
                if (handle === "line-start" || handle === "line-end") {
                  if (selectedElement.type === "shape") {
                    lineEndpointBeforeRef.current = {
                      transform: { ...selectedElement.transform },
                      size: { ...selectedElement.size },
                    };
                  }
                } else {
                  transformBeforeRef.current = { ...selectedElement.transform };
                }
                return;
              }
            }
          }

          // Otherwise, check if we hit an element
          const hitElement = hitTestElements(point, elements);
          if (hitElement) {
            if (e.shiftKey) {
              // Add to selection
              if (!selectedIds.includes(hitElement.id)) {
                selectElements([...selectedIds, hitElement.id]);
              }
            } else {
              // Select single element (or keep if already selected for drag)
              if (!selectedIds.includes(hitElement.id)) {
                selectElements([hitElement.id]);
              }
            }
            // Start drag
            setIsDragging(true);
            dragStartRef.current = point;
            // Store initial positions of all selected elements
            const positions = new Map<string, Point>();
            const idsToTrack = selectedIds.includes(hitElement.id)
              ? selectedIds
              : [hitElement.id];
            for (const id of idsToTrack) {
              const el = elements.find((elem) => elem.id === id);
              if (el) {
                positions.set(id, {
                  x: el.transform.x,
                  y: el.transform.y,
                });
              }
            }
            dragElementStartPositions.current = positions;
          } else {
            // Click on empty space - start marquee selection
            setIsMarqueeSelecting(true);
            marqueeStartRef.current = point;
            setMarqueeRect({ x: point.x, y: point.y, width: 0, height: 0 });

            // Store current selection for Shift+drag additive mode
            preMarqueeSelectionRef.current = e.shiftKey ? [...selectedIds] : [];

            if (!e.shiftKey) {
              clearSelection();
            }
          }
          break;
        }

        case "text":
          setTextPosition(point);
          setIsAddingText(true);
          break;

        case "pen":
        case "eraser":
          setIsDrawing(true);
          currentStrokeRef.current = [point];
          break;

        case "shape":
          setIsDrawingShape(true);
          shapeStartRef.current = point;
          setShapePreview({ x: point.x, y: point.y, width: 0, height: 0 });
          break;
      }
    },
    [
      tool,
      isSpacePressed,
      getCanvasPoint,
      elements,
      selectedIds,
      selectElements,
      clearSelection,
      viewport.zoom,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle panning
      if (isPanning && panStartRef.current) {
        const deltaX = e.clientX - panStartRef.current.x;
        const deltaY = e.clientY - panStartRef.current.y;
        panBy(deltaX, deltaY);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const point = getCanvasPoint(e);
      if (!point) return;

      // Update cursor preview (handles visibility, position, size, and color)
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        updateCursorPreview(e.clientX - rect.left, e.clientY - rect.top);
      }

      // Early exit when not in select mode and not actively interacting
      if (
        tool !== "select" &&
        !isDragging &&
        !isDrawing &&
        !isDrawingShape &&
        !isMarqueeSelecting &&
        !activeHandle
      ) {
        return;
      }

      // Handle resize/rotate/line-endpoint dragging
      if (activeHandle && selectedIds.length === 1 && resizeStartRef.current) {
        const element = elements.find((el) => el.id === selectedIds[0]);
        if (element) {
          if (activeHandle === "rotate") {
            // Calculate new rotation
            const newRotation = calculateRotation(point, {
              x: element.transform.x,
              y: element.transform.y,
            });
            updateElement(element.id, {
              transform: {
                ...element.transform,
                rotation: newRotation,
              },
            });
          } else if (
            activeHandle === "line-start" ||
            activeHandle === "line-end"
          ) {
            // Handle line/arrow endpoint dragging
            if (element.type === "shape" && dragStartRef.current) {
              // Get current endpoints in world space (accounting for scale)
              const rad = (element.transform.rotation * Math.PI) / 180;
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const halfWidth =
                (element.size.width * element.transform.scaleX) / 2;

              const startWorld = {
                x: element.transform.x + -halfWidth * cos,
                y: element.transform.y + -halfWidth * sin,
              };
              const endWorld = {
                x: element.transform.x + halfWidth * cos,
                y: element.transform.y + halfWidth * sin,
              };

              // Update the dragged endpoint
              const newStart =
                activeHandle === "line-start" ? point : startWorld;
              const newEnd = activeHandle === "line-end" ? point : endWorld;

              // Calculate new center, length, and rotation
              const newCenterX = (newStart.x + newEnd.x) / 2;
              const newCenterY = (newStart.y + newEnd.y) / 2;
              const newLength = Math.sqrt(
                Math.pow(newEnd.x - newStart.x, 2) +
                  Math.pow(newEnd.y - newStart.y, 2),
              );
              const newRotation =
                (Math.atan2(newEnd.y - newStart.y, newEnd.x - newStart.x) *
                  180) /
                Math.PI;

              // Bake scale into size and reset scale to 1.0
              updateElement(element.id, {
                size: {
                  width: newLength,
                  height: element.size.height,
                },
                transform: {
                  ...element.transform,
                  x: newCenterX,
                  y: newCenterY,
                  rotation: newRotation,
                  scaleX: 1.0,
                  scaleY: 1.0,
                },
              });
            }
          } else if (activeHandle.startsWith("resize-")) {
            // Calculate new scale (uniform scaling from any corner)
            const { scaleX, scaleY } = calculateResizeScale(
              point,
              { x: element.transform.x, y: element.transform.y },
              resizeStartRef.current.bounds,
              resizeStartRef.current.scale,
              element.transform.rotation,
            );
            updateElement(element.id, {
              transform: {
                ...element.transform,
                scaleX,
                scaleY,
              },
            });
          }
        }
        return;
      }

      // Handle dragging selected elements - check BEFORE hover detection
      // to avoid expensive hit testing on every mouse move during drag
      if (isDragging && dragStartRef.current && selectedIds.length > 0) {
        const dx = point.x - dragStartRef.current.x;
        const dy = point.y - dragStartRef.current.y;

        for (const id of selectedIds) {
          const startPos = dragElementStartPositions.current.get(id);
          if (startPos) {
            // Use updateElementPosition to preserve rotation/scale
            updateElementPosition(id, startPos.x + dx, startPos.y + dy);
          }
        }
        return;
      }

      // Handle marquee selection - dynamically update selection as marquee changes
      if (isMarqueeSelecting && marqueeStartRef.current) {
        const start = marqueeStartRef.current;
        const newRect = {
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          width: Math.abs(point.x - start.x),
          height: Math.abs(point.y - start.y),
        };
        setMarqueeRect(newRect);

        // Dynamically update selection based on intersection
        const intersecting = getElementsInRect(newRect, elements);
        const intersectingIds = intersecting.map((el) => el.id);

        // Combine with pre-marquee selection (for Shift+drag additive mode)
        const newSelection = [
          ...new Set([...preMarqueeSelectionRef.current, ...intersectingIds]),
        ];
        selectElements(newSelection);
        return;
      }

      // Check if hovering over any element or handle (for cursor feedback)
      // Only runs when not actively dragging, so hover states update correctly
      if (tool === "select") {
        // First check handles of selected element
        if (selectedIds.length === 1) {
          const selectedElement = elements.find(
            (el) => el.id === selectedIds[0],
          );
          if (selectedElement) {
            const handle = getHandleAtPoint(
              point,
              selectedElement,
              viewport.zoom,
            );
            setHoveredHandle(handle);
            if (handle) {
              setIsHoveringElement(true);
              return;
            }
          }
        }
        // Then check elements
        const hitElement = hitTestElements(point, elements);
        setIsHoveringElement(hitElement !== null);
        setHoveredHandle(hitElement ? "move" : null);
      } else {
        setIsHoveringElement(false);
        setHoveredHandle(null);
      }

      // Handle drawing
      if (isDrawing && (tool === "pen" || tool === "eraser")) {
        currentStrokeRef.current.push(point);
        renderCanvas();
      }

      // Handle shape drawing preview
      if (isDrawingShape && shapeStartRef.current) {
        const start = shapeStartRef.current;
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        const isLinear = shapeType === "line" || shapeType === "arrow";

        if (isLinear) {
          // For lines/arrows: calculate length and angle
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          setShapePreview({
            x: start.x + dx / 2, // Center point
            y: start.y + dy / 2, // Center point
            width: length,
            height: 0,
            rotation: angle,
          });
        } else {
          // For rectangles/ellipses: use width/height as before
          setShapePreview({
            x: start.x + dx / 2,
            y: start.y + dy / 2,
            width: Math.abs(dx),
            height: Math.abs(dy),
          });
        }
      }
    },
    [
      isPanning,
      isDragging,
      isDrawing,
      isDrawingShape,
      isMarqueeSelecting,
      activeHandle,
      tool,
      shapeType,
      selectedIds,
      elements,
      getCanvasPoint,
      panBy,
      updateElement,
      updateElementPosition,
      updateCursorPreview,
      renderCanvas,
      selectElements,
      viewport.zoom,
    ],
  );

  const handleMouseUp = useCallback(() => {
    commitInteraction();
    setIsPanning(false);
    panStartRef.current = null;
  }, [commitInteraction]);

  const handleMouseLeave = useCallback(() => {
    updateCursorPreview(); // Hide cursor preview
    setIsHoveringElement(false);
    setHoveredHandle(null);
  }, [updateCursorPreview]);

  // ---------------------------------------------------------------------------
  // Wheel handler for zooming
  // ---------------------------------------------------------------------------
  const handleWheelEvent = useCallback(
    (e: React.WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      handleWheel(e, rect);
    },
    [handleWheel],
  );

  // ---------------------------------------------------------------------------
  // Text input handlers
  // ---------------------------------------------------------------------------
  const handleTextCommit = useCallback(
    (text: string) => {
      if (!text.trim()) {
        setIsAddingText(false);
        return;
      }

      // Measure text to calculate the center position for rendering.
      // Text elements are rendered centered on their transform position, so we need
      // to calculate where the center should be based on where the text appears in the input.
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `${fontSize}px ${FONT_FAMILY}`;
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        // Calculate where the text top-left appears, then offset to center for rendering.
        // TEXT_CONTENT_OFFSET accounts for where text actually appears relative to textPosition.
        const textTopLeftX = textPosition.x + TEXT_CONTENT_OFFSET.x;
        const textTopLeftY = textPosition.y + TEXT_CONTENT_OFFSET.y;
        const adjustedX = textTopLeftX + textWidth / 2;
        const adjustedY = textTopLeftY + textHeight / 2;

        const textElement = createTextElement(text, adjustedX, adjustedY, {
          fontSize,
          fontFamily: FONT_FAMILY,
          color: strokeColor,
        });
        addElement(textElement);
        recordAdd([textElement]); // Record for undo
      }
      setIsAddingText(false);
    },
    [fontSize, strokeColor, textPosition, addElement, recordAdd],
  );

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleTextCommit(e.currentTarget.value);
      } else if (e.key === "Escape") {
        setIsAddingText(false);
      }
    },
    [handleTextCommit],
  );

  // ---------------------------------------------------------------------------
  // Toolbar actions
  // ---------------------------------------------------------------------------
  const handleClear = useCallback(() => {
    if (elements.length > 0) {
      recordClear(elements); // Record for undo before clearing
    }
    clearCanvas();
    resetZoom();
  }, [elements, recordClear, clearCanvas, resetZoom]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu({ clientX: e.clientX, clientY: e.clientY });
    },
    [onContextMenu],
  );

  const handleAddImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void addImageToCanvas(file);
    };
    input.click();
  }, [addImageToCanvas]);

  // ---------------------------------------------------------------------------
  // Zoom toolbar handlers
  // ---------------------------------------------------------------------------
  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      zoomIn(canvas.getBoundingClientRect());
    }
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      zoomOut(canvas.getBoundingClientRect());
    }
  }, [zoomOut]);

  // ---------------------------------------------------------------------------
  // Cursor based on tool and state
  // ---------------------------------------------------------------------------
  // Get the rotation of the selected element for cursor calculation
  const selectedElementRotation = useMemo(() => {
    if (selectedIds.length === 1) {
      const element = elements.find((el) => el.id === selectedIds[0]);
      return element?.transform.rotation ?? 0;
    }
    return 0;
  }, [selectedIds, elements]);

  const cursor = useMemo(() => {
    if (isPanning) {
      return "grabbing";
    }
    if (activeHandle) {
      // Currently dragging a handle
      if (activeHandle === "rotate") {
        return "grabbing";
      }
      return getCursorForHandle(activeHandle, selectedElementRotation);
    }
    if (isDragging) {
      return "move";
    }
    if (isSpacePressed || tool === "hand") {
      return "grab";
    }
    switch (tool) {
      case "select":
        // Show appropriate cursor for hovered handle
        if (hoveredHandle) {
          return getCursorForHandle(hoveredHandle, selectedElementRotation);
        }
        return isHoveringElement ? "move" : "default";
      case "text":
        return "text";
      case "pen":
      case "eraser":
        return "none";
      case "shape":
        return "crosshair";
      default:
        return "crosshair";
    }
  }, [
    tool,
    isPanning,
    isDragging,
    isSpacePressed,
    isHoveringElement,
    activeHandle,
    hoveredHandle,
    selectedElementRotation,
  ]);

  // Hide cursor preview when conditions change (tool switch, panning starts, etc.)
  useEffect(() => {
    if ((tool !== "pen" && tool !== "eraser") || isPanning || isSpacePressed) {
      updateCursorPreview();
    }
  }, [tool, isPanning, isSpacePressed, updateCursorPreview]);

  // Calculate text input screen position from canvas position
  const textInputScreenPos = useMemo(() => {
    if (!isAddingText) return null;
    const screenPoint = canvasToScreenPoint(textPosition.x, textPosition.y);
    return {
      x: screenPoint.x + TEXT_INPUT_OFFSET.x,
      y: screenPoint.y + TEXT_INPUT_OFFSET.y,
    };
  }, [isAddingText, textPosition, canvasToScreenPoint]);

  // ---------------------------------------------------------------------------
  // Selected element style info (for toolbar)
  // ---------------------------------------------------------------------------

  // Compute whether selected elements are stylable and their current styles
  const selectedStyleInfo = useMemo(() => {
    if (selectedIds.length === 0) {
      return { hasStylableSelection: false };
    }

    // Find selected elements that have style properties
    // Exclude eraser strokes - their style is not editable and has no visual effect
    const stylableElements = elements.filter(
      (el) =>
        selectedIds.includes(el.id) &&
        "style" in el &&
        !(el.type === "stroke" && el.isEraser),
    );

    if (stylableElements.length === 0) {
      return { hasStylableSelection: false };
    }

    // Get the first stylable element's style for display
    const firstElement = stylableElements[0];
    const style = "style" in firstElement ? firstElement.style : null;

    // Extract width - only stroke and shape have width property
    const selectedWidth =
      firstElement.type === "stroke" || firstElement.type === "shape"
        ? firstElement.style.width
        : undefined;

    // Check if any selected element supports width changes (stroke or shape, not text)
    const hasWidthSupport = stylableElements.some(
      (el) => el.type === "stroke" || el.type === "shape",
    );

    // Check if any selected element supports fill (only rectangle and ellipse shapes)
    const fillableElements = stylableElements.filter(
      (el) =>
        el.type === "shape" &&
        (el.shapeType === "rectangle" || el.shapeType === "ellipse"),
    );
    const hasFillableSelection = fillableElements.length > 0;

    // Get fill from first fillable element
    const selectedFill =
      hasFillableSelection && fillableElements[0].type === "shape"
        ? fillableElements[0].style.fill
        : undefined;

    return {
      hasStylableSelection: true,
      hasWidthSupport,
      hasFillableSelection,
      selectedColor: style?.color,
      selectedWidth,
      selectedFill,
      stylableElements,
      fillableElements,
    };
  }, [selectedIds, elements]);

  // Apply a style patch to elements and record it as a single undo step
  const restyleElements = useCallback(
    (targets: CanvasElement[], patch: ElementStyle) => {
      const changes = new Map<
        string,
        { before: ElementStyle; after: ElementStyle }
      >();

      for (const el of targets) {
        if (!("style" in el)) continue;
        const before: ElementStyle = {
          color: el.style.color,
          width:
            el.type === "stroke" || el.type === "shape"
              ? el.style.width
              : undefined,
          ...("fill" in patch && {
            fill: el.type === "shape" ? el.style.fill : undefined,
          }),
        };
        changes.set(el.id, { before, after: { ...before, ...patch } });
        updateElementStyle(el.id, patch);
      }

      recordStyle(changes);
    },
    [updateElementStyle, recordStyle],
  );

  // Style changes update the selection in select mode, otherwise the tool defaults
  const handleColorChange = useCallback(
    (color: string) => {
      if (tool === "select" && selectedStyleInfo.hasStylableSelection) {
        restyleElements(selectedStyleInfo.stylableElements ?? [], { color });
      } else {
        setStrokeColor(color);
      }
    },
    [tool, selectedStyleInfo, restyleElements],
  );

  const handleSizeChange = useCallback(
    (size: number) => {
      if (tool === "select" && selectedStyleInfo.hasStylableSelection) {
        restyleElements(
          (selectedStyleInfo.stylableElements ?? []).filter(
            (el) => el.type === "stroke" || el.type === "shape",
          ),
          { width: size },
        );
      } else {
        setStrokeWidth(size);
      }
    },
    [tool, selectedStyleInfo, restyleElements],
  );

  const handleFillChange = useCallback(
    (newFill: FillStyle | undefined) => {
      if (tool === "select" && selectedStyleInfo.hasFillableSelection) {
        restyleElements(selectedStyleInfo.fillableElements ?? [], {
          fill: newFill,
        });
      } else {
        setFill(newFill);
      }
    },
    [tool, selectedStyleInfo, restyleElements],
  );

  // The root takes the canvas's keyboard shortcuts
  useFocusWhenActive(isActive, paneRef, () =>
    paneRef.current?.focus({ preventScroll: true }),
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      ref={paneRef}
      className="relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0 bg-background outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
      onPaste={handlePaste}
    >
      <CanvasToolbar
        tool={tool}
        onToolChange={setTool}
        strokeColor={strokeColor}
        onStrokeColorChange={handleColorChange}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={handleSizeChange}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        shapeType={shapeType}
        onShapeTypeChange={setShapeType}
        fill={fill}
        onFillChange={handleFillChange}
        onClear={handleClear}
        onCopyToClipboard={handleCopyToClipboard}
        onAddImage={handleAddImage}
        showCopySuccess={showCopySuccess}
        zoom={viewport.zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={resetZoom}
        onZoomToFit={handleZoomToFit}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        hasStylableSelection={selectedStyleInfo.hasStylableSelection}
        hasFillableSelection={selectedStyleInfo.hasFillableSelection}
        hasWidthSupport={selectedStyleInfo.hasWidthSupport}
        selectedColor={selectedStyleInfo.selectedColor}
        selectedWidth={selectedStyleInfo.selectedWidth}
        selectedFill={selectedStyleInfo.selectedFill}
        isSpacePressed={isSpacePressed}
        tabId={_tabId}
        isEmpty={elements.length === 0}
        showDotGrid={showDotGrid}
        onToggleDotGrid={toggleDotGrid}
      />

      {/* Canvas container - fills remaining space */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 min-w-0 overflow-hidden"
        {...imageDragHandlers}
      >
        {/* Image drop overlay */}
        {isImageDragOver && (
          <div className="pointer-events-none absolute inset-0 z-[35] bg-accent/40" />
        )}
        <canvas
          id={`canvas-${paneId}`}
          ref={canvasRef}
          width={canvasSize.width * dpr}
          height={canvasSize.height * dpr}
          className="absolute inset-0"
          style={{
            cursor,
            backgroundColor,
            width: canvasSize.width,
            height: canvasSize.height,
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheelEvent}
          onContextMenu={handleContextMenu}
        />

        {/* Cursor preview circle - all styling controlled via DOM in updateCursorPreview */}
        <div
          ref={cursorPreviewRef}
          className="absolute pointer-events-none rounded-full border"
          style={{ display: "none" }}
        />

        {/* Shape preview while drawing */}
        {isDrawingShape && shapePreview && shapePreview.width > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvasSize.width}
            height={canvasSize.height}
          >
            {(() => {
              // Convert canvas coords to screen coords for preview
              const screenX = (shapePreview.x + viewport.panX) * viewport.zoom;
              const screenY = (shapePreview.y + viewport.panY) * viewport.zoom;
              const screenW = shapePreview.width * viewport.zoom;
              const screenH =
                (shapePreview.height || shapePreview.width) * viewport.zoom;

              const commonProps = {
                stroke: strokeColor,
                strokeWidth: strokeWidth * viewport.zoom,
                fill: "none",
              };

              switch (shapeType) {
                case "rectangle":
                  return (
                    <rect
                      x={screenX - screenW / 2}
                      y={screenY - screenH / 2}
                      width={screenW}
                      height={screenH}
                      {...commonProps}
                    />
                  );
                case "ellipse":
                  return (
                    <ellipse
                      cx={screenX}
                      cy={screenY}
                      rx={screenW / 2}
                      ry={screenH / 2}
                      {...commonProps}
                    />
                  );
                case "line": {
                  const rotation = shapePreview.rotation ?? 0;
                  return (
                    <line
                      x1={screenX - screenW / 2}
                      y1={screenY}
                      x2={screenX + screenW / 2}
                      y2={screenY}
                      transform={`rotate(${rotation} ${screenX} ${screenY})`}
                      {...commonProps}
                    />
                  );
                }
                case "arrow": {
                  // Match the render logic: head size scales with stroke width
                  const strokeW = strokeWidth * viewport.zoom;
                  const { length: headLength, width: headWidth } =
                    calculateArrowHead(strokeW);
                  const rotation = shapePreview.rotation ?? 0;
                  const tipX = screenX + screenW / 2;
                  return (
                    <g
                      {...commonProps}
                      transform={`rotate(${rotation} ${screenX} ${screenY})`}
                    >
                      <line
                        x1={screenX - screenW / 2}
                        y1={screenY}
                        x2={tipX}
                        y2={screenY}
                      />
                      <polyline
                        points={`${tipX - headLength},${screenY - headWidth} ${tipX},${screenY} ${tipX - headLength},${screenY + headWidth}`}
                        strokeLinejoin="miter"
                      />
                    </g>
                  );
                }
                default:
                  return null;
              }
            })()}
          </svg>
        )}

        {/* Marquee selection rectangle */}
        {isMarqueeSelecting &&
          marqueeRect &&
          marqueeRect.width > 0 &&
          marqueeRect.height > 0 && (
            <div
              className="absolute border border-accent bg-accent/10 pointer-events-none"
              style={{
                left: (marqueeRect.x + viewport.panX) * viewport.zoom,
                top: (marqueeRect.y + viewport.panY) * viewport.zoom,
                width: marqueeRect.width * viewport.zoom,
                height: marqueeRect.height * viewport.zoom,
              }}
            />
          )}

        {/* Text input overlay */}
        {isAddingText && textInputScreenPos && (
          <input
            ref={textInputRef}
            type="text"
            className="absolute bg-transparent outline-none border border-accent rounded px-1 z-10"
            style={{
              left: textInputScreenPos.x,
              top: textInputScreenPos.y,
              fontSize: `${fontSize * viewport.zoom}px`,
              fontFamily: FONT_FAMILY,
              color: strokeColor,
              minWidth: "100px",
              transform: `scale(${1 / viewport.zoom})`,
              transformOrigin: "top left",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => textInputReady && handleTextCommit(e.target.value)}
            onKeyDown={handleTextKeyDown}
          />
        )}
      </div>
    </div>
  );
});
