/**
 * FileDiffStats - Per-file diff statistics display components.
 *
 * Provides a self-contained way to display lines added/removed for files.
 * Stats auto-refresh when git status or file content changes.
 *
 * Components:
 * - FileDiffStatsProvider: Context provider that fetches and maintains stats
 * - FileDiffStats: Display component that shows +X -Y for a file
 *
 * Hooks:
 * - useFileDiffStats: Get stats for a specific file
 *
 * @example
 * ```tsx
 * // Wrap tree with provider
 * <FileDiffStatsProvider git={git} fs={fs}>
 *   <FileList />
 * </FileDiffStatsProvider>
 *
 * // Use component anywhere in tree
 * <FileDiffStats filePath="src/app.tsx" />
 * <FileDiffStats filePath="src/app.tsx" isUnseen />
 * ```
 */

export {
  FileDiffStatsProvider,
  useFileDiffStats,
  type FileDiffStat,
  type FileDiffStatsProviderProps,
} from "./FileDiffStatsContext";

export { FileDiffStats, type FileDiffStatsProps } from "./FileDiffStats";
