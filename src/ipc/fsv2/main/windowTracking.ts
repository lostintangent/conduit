/**
 * Window Provider Tracking - Manages provider lifecycle per window.
 *
 * This module tracks which providers are in use by which windows, enabling
 * proper reference counting and cleanup when windows close. It acts as an
 * intermediary between IPC handlers and the provider services.
 *
 * Key Responsibilities:
 * 1. Track provider references per window (windowId → cwd → refCount)
 * 2. Coordinate with FileSystemProviderService and GitProviderService
 * 3. Clean up all providers when a window closes
 * 4. Prevent resource leaks from abandoned subscriptions
 *
 * Architecture:
 * ```
 * Window 1 ──┐                    ┌── FileSystemProviderService
 *            ├── WindowTracking ──┤
 * Window 2 ──┘                    └── GitProviderService
 * ```
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import { FileSystemProviderService } from "../services/FileSystemProviderService";
import { GitProviderService } from "../../gitv2/services/GitProviderService";

// ============================================================================
// Types
// ============================================================================

/**
 * Provider types that can be tracked.
 */
type ProviderType = "filesystem" | "git";

/**
 * Key for identifying a provider instance.
 */
interface ProviderKey {
  type: ProviderType;
  /** For filesystem: cwd, for git: gitRoot */
  path: string;
}

/**
 * Tracking entry for a single provider reference.
 */
interface ProviderRef {
  refCount: number;
  /** Subscription cleanup functions */
  subscriptions: Array<() => void>;
}

// ============================================================================
// State
// ============================================================================

/**
 * Map of window ID → provider key → reference tracking.
 *
 * Structure: windowId → Map<providerKeyString, ProviderRef>
 */
const windowProviders = new Map<number, Map<string, ProviderRef>>();

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Create a string key for a provider reference.
 */
function makeProviderKey(type: ProviderType, path: string): string {
  return `${type}:${path}`;
}

/**
 * Get or create the provider map for a window.
 */
function getWindowMap(windowId: number): Map<string, ProviderRef> {
  let windowMap = windowProviders.get(windowId);
  if (!windowMap) {
    windowMap = new Map();
    windowProviders.set(windowId, windowMap);
  }
  return windowMap;
}

// ============================================================================
// FileSystem Provider Tracking
// ============================================================================

/**
 * Get a filesystem provider for a window.
 *
 * This acquires a reference to the provider for the given CWD, tracking it
 * against the window. Multiple calls with the same windowId and cwd will
 * increment the reference count.
 *
 * @param windowId - The window requesting the provider
 * @param cwd - The working directory for the provider
 * @returns The filesystem provider instance
 */
export async function getFileSystemProvider(windowId: number, cwd: string) {
  const service = FileSystemProviderService.getInstance();
  const provider = await service.getProvider(cwd);

  // Track this reference for the window
  const windowMap = getWindowMap(windowId);
  const key = makeProviderKey("filesystem", cwd);

  const existing = windowMap.get(key);
  if (existing) {
    existing.refCount++;
  } else {
    windowMap.set(key, { refCount: 1, subscriptions: [] });
  }

  return provider;
}

/**
 * Release a filesystem provider reference for a window.
 *
 * Decrements the window's reference count for this provider. When the count
 * reaches zero, the reference is removed from window tracking. The provider
 * service handles actual disposal with its grace period.
 *
 * @param windowId - The window releasing the provider
 * @param cwd - The working directory of the provider to release
 */
export function releaseFileSystemProvider(windowId: number, cwd: string): void {
  const windowMap = windowProviders.get(windowId);
  if (!windowMap) {
    return;
  }

  const key = makeProviderKey("filesystem", cwd);
  const ref = windowMap.get(key);
  if (!ref) {
    return;
  }

  ref.refCount--;

  if (ref.refCount <= 0) {
    // Clean up subscriptions
    for (const cleanup of ref.subscriptions) {
      try {
        cleanup();
      } catch (error) {
        console.error(
          "[WindowTracking] Error cleaning up subscription:",
          error,
        );
      }
    }

    windowMap.delete(key);

    // Release from the service
    FileSystemProviderService.getInstance().releaseProvider(cwd);
  }
}

/**
 * Add a subscription cleanup function for a filesystem provider.
 *
 * When the window releases the provider or closes, these cleanup functions
 * will be called to unsubscribe from events.
 *
 * @param windowId - The window that owns the subscription
 * @param cwd - The provider's working directory
 * @param cleanup - Function to call when cleaning up
 */
export function addFileSystemSubscription(
  windowId: number,
  cwd: string,
  cleanup: () => void,
): void {
  const windowMap = getWindowMap(windowId);
  const key = makeProviderKey("filesystem", cwd);

  const ref = windowMap.get(key);
  if (ref) {
    ref.subscriptions.push(cleanup);
  }
}

// ============================================================================
// Git Provider Tracking
// ============================================================================

/**
 * Get a git provider for a window.
 *
 * This acquires a reference to the provider for the given CWD, tracking it
 * against the window. The provider is keyed by git root, not CWD.
 *
 * @param windowId - The window requesting the provider
 * @param cwd - The working directory (will be resolved to git root)
 * @returns The git provider instance and git root, or null if not a git repo
 */
export async function getGitProvider(windowId: number, cwd: string) {
  const service = GitProviderService.getInstance();

  try {
    const { provider, gitRoot } = await service.getProvider(cwd);

    // Track this reference for the window (keyed by gitRoot)
    const windowMap = getWindowMap(windowId);
    const key = makeProviderKey("git", gitRoot);

    const existing = windowMap.get(key);
    if (existing) {
      existing.refCount++;
    } else {
      windowMap.set(key, { refCount: 1, subscriptions: [] });
    }

    return { provider, gitRoot };
  } catch {
    // Not a git repository
    return null;
  }
}

/**
 * Release a git provider reference for a window.
 *
 * @param windowId - The window releasing the provider
 * @param gitRoot - The git root of the provider to release
 */
export function releaseGitProvider(windowId: number, gitRoot: string): void {
  const windowMap = windowProviders.get(windowId);
  if (!windowMap) {
    return;
  }

  const key = makeProviderKey("git", gitRoot);
  const ref = windowMap.get(key);
  if (!ref) {
    return;
  }

  ref.refCount--;

  if (ref.refCount <= 0) {
    // Clean up subscriptions
    for (const cleanup of ref.subscriptions) {
      try {
        cleanup();
      } catch (error) {
        console.error(
          "[WindowTracking] Error cleaning up subscription:",
          error,
        );
      }
    }

    windowMap.delete(key);

    // Release from the service
    GitProviderService.getInstance().releaseProvider(gitRoot);
  }
}

/**
 * Add a subscription cleanup function for a git provider.
 *
 * @param windowId - The window that owns the subscription
 * @param gitRoot - The provider's git root
 * @param cleanup - Function to call when cleaning up
 */
export function addGitSubscription(
  windowId: number,
  gitRoot: string,
  cleanup: () => void,
): void {
  const windowMap = getWindowMap(windowId);
  const key = makeProviderKey("git", gitRoot);

  const ref = windowMap.get(key);
  if (ref) {
    ref.subscriptions.push(cleanup);
  }
}

// ============================================================================
// Window Lifecycle
// ============================================================================

/**
 * Clean up all providers for a window.
 *
 * This should be called when a window closes to release all provider
 * references held by that window.
 *
 * @param windowId - The window that is closing
 */
export function cleanupWindow(windowId: number): void {
  const windowMap = windowProviders.get(windowId);
  if (!windowMap) {
    return;
  }

  const fsService = FileSystemProviderService.getInstance();
  const gitService = GitProviderService.getInstance();

  for (const [key, ref] of windowMap) {
    // Clean up all subscriptions
    for (const cleanup of ref.subscriptions) {
      try {
        cleanup();
      } catch (error) {
        console.error(
          "[WindowTracking] Error cleaning up subscription:",
          error,
        );
      }
    }

    // Parse the key to determine provider type
    const [type, path] = key.split(":", 2) as [ProviderType, string];

    // Release all references at once
    for (let i = 0; i < ref.refCount; i++) {
      if (type === "filesystem") {
        fsService.releaseProvider(path);
      } else if (type === "git") {
        gitService.releaseProvider(path);
      }
    }
  }

  windowProviders.delete(windowId);
}

/**
 * Get statistics about tracked providers.
 *
 * Useful for debugging and monitoring.
 */
export function getTrackingStats(): {
  windowCount: number;
  providerCount: number;
  subscriptionCount: number;
} {
  let providerCount = 0;
  let subscriptionCount = 0;

  for (const windowMap of windowProviders.values()) {
    providerCount += windowMap.size;
    for (const ref of windowMap.values()) {
      subscriptionCount += ref.subscriptions.length;
    }
  }

  return {
    windowCount: windowProviders.size,
    providerCount,
    subscriptionCount,
  };
}

/**
 * Reset all tracking state.
 *
 * This is primarily for testing. In production, use cleanupWindow for
 * individual windows.
 */
export function resetTracking(): void {
  // Clean up all windows first
  for (const windowId of windowProviders.keys()) {
    cleanupWindow(windowId);
  }

  windowProviders.clear();
}
