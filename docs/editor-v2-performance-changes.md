# Editor V2 Performance Changes Summary

This document summarizes all performance-related changes made to Editor V2 and their impact.

## 1. New `readTextFile` IPC Channel

**Files**: `DiskFileSystemProvider.ts`, `VMFileSystemProvider.ts`, `handlers.ts`, `fsv2.ts`, `FileSystemV2API.ts`

**Change**: Added dedicated `readTextFile` method that returns a string directly instead of `Uint8Array`.

**Impact**: Convenience method that avoids the need for `TextDecoder.decode()` on the renderer side. Used by Monaco model loading. Note: IPC performance for strings vs `Uint8Array` is similar (both use Structured Clone), but this simplifies the caller code and was part of eliminating duplicate file reads.

---

## 2. Eliminated Duplicate File Read in `handleFileSelect`

**File**: `EditorPaneV2.tsx:610-700`

**Before**: `handleFileSelect` called `fs.readTextFile()` to read content for `onFileChange` callback AND Monaco registry loaded the same file again.

**After**: `onFileChange` callback no longer includes `content` (optional). Monaco model registry handles the single file read.

**Impact**: Eliminated ~300ms latency from duplicate file reads on every file selection.

---

## 3. `startTransition` for File Selection State Updates

**File**: `EditorPaneV2.tsx:640-670`

**Change**: Wrapped `setSelectedFile`, `setPanelView`, and `setViewModePreservingReview` in `startTransition()`.

**Impact**: Makes file selection renders non-blocking, allowing IPC responses to be processed during the render. Reduces perceived latency.

---

## 4. Skip `stat()` Call - Read File Directly

**File**: `MonacoModelRegistry.ts:870-920`

**Before**: Called `fsApi.stat()` to check file size THEN called `fsApi.readTextFile()` - two IPC round trips.

**After**: Directly calls `readTextFile()` and checks `content.length` after. Size check uses `content.length * 2` estimate.

**Impact**: Eliminated 60-314ms latency from redundant `stat()` call (which had FileSystem provider initialization overhead).

---

## 5. `useSyncExternalStore` for Monaco Model

**File**: `useMonacoModel.ts:57-160`

**Change**: Replaced `useState` + `useEffect` pattern with `useSyncExternalStore` for reading the model.

**How it works**:

- `getSnapshot()` reads model synchronously during render when cached
- `subscribe()` listens for model availability changes
- Registry fires `_onModelAvailabilityChanged` event when model is added

**Impact**: When model is cached, it's read synchronously during render - no extra render cycle. Eliminates ~150ms for cached file switches.

---

## 6. File Prefetch on Hover

**Files**: `useFilePrefetch.ts` (new), `FileTreeItem.tsx`, `FileTreeNormal.tsx`

**Change**: Added hover-based prefetching with 400ms delay. When user hovers over a file in the tree, starts loading into Monaco registry.

**Impact**: Files are often pre-loaded before user clicks, making selection feel instant. Automatically deduplicated by registry.

---

## 7. Stabilized `isExpanded` Callback

**File**: `useExpandedPaths.ts:70-83`

**Change**: Added `expandedPathsRef` to read expanded state without callback dependencies.

```typescript
const expandedPathsRef = useRef<Set<string>>(expandedPaths);
expandedPathsRef.current = expandedPaths;
const isExpanded = useCallback(
  (path: string) => expandedPathsRef.current.has(...),
  [], // Stable
);
```

**Impact**: `renderDirectory` callback doesn't get recreated when expanded paths change.

---

## 8. Removed Custom `arePropsEqual` from FileTreeItem

**File**: `FileTreeItem.tsx:115-140`

**Change**: Removed custom memo comparison that was skipping `children` comparison.

**Impact**: Fixed selection highlighting. The custom comparison was preventing prop updates from propagating to nested tree items.

---

## 9. `effectiveFocus` Derivation in FileTreeItem

**File**: `FileTreeItem.tsx:240-244`

**Change**: Files derive focus from selection state:

```typescript
const effectiveFocus = isDirectory ? isFocused : isFocused || isSelected;
```

**Impact**: Enables single-render optimization - no need for separate `setFocusedPath` call when clicking files.

---

## 10. Modified `handleItemClick` - No `setFocusedPath` for Files

**File**: `FileTreeNormal.tsx:1057-1068`

**Change**: File clicks only call `handleSelect()`, not `setFocusedPath()`. Directories still set focused path.

**Impact**: Eliminated double render per file click (previously had sync `setFocusedPath` + transition `setSelectedFile`).

---

## 11. Memoized `FileTreeNormal` Component

**File**: `FileTreeNormal.tsx:130`

**Change**: Wrapped component in `memo()`.

**Impact**: Prevents re-renders when parent props haven't changed.

---

## Net Performance Impact

| Metric                          | Before              | After       | Improvement     |
| ------------------------------- | ------------------- | ----------- | --------------- |
| File reads per selection        | 2                   | 1           | 50% fewer       |
| IPC calls per selection         | 3+ (stat + 2x read) | 1 (read)    | ~66% fewer      |
| FileTreePanel renders per click | 2                   | 1           | 50% fewer       |
| FileTreePanel render time       | 65-85ms             | 40-45ms     | ~40% faster     |
| **Total tree time per click**   | **130-170ms**       | **~45ms**   | **~70% faster** |
| Cached file switch latency      | ~150ms extra render | Synchronous | Eliminated      |
