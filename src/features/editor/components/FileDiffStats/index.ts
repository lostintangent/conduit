/**
 * FileDiffStats - Per-file and section diff statistics display components.
 *
 * Provides a self-contained way to display lines added/removed.
 * Stats auto-refresh when git status or file content changes.
 *
 * Architecture:
 * - FileDiffStatsProvider: Context provider that fetches and maintains stats
 * - DiffStatsDisplay: Presentational component (rendering + flash animation)
 * - FileDiffStats: Container for per-file stats
 * - SectionDiffStats: Container for section totals (staged/unstaged)
 *
 * Hooks:
 * - useFileDiffStats: Get stats for a specific file
 * - useSectionTotalStats: Get total stats for a section (staged/unstaged)
 *
 * @example
 * ```tsx
 * // Wrap tree with provider
 * <FileDiffStatsProvider git={git} fs={fs}>
 *   <FileList />
 * </FileDiffStatsProvider>
 *
 * // Per-file stats (pass staged for correct partially-staged file handling)
 * <FileDiffStats filePath="src/app.tsx" staged={true} />   // in staged section
 * <FileDiffStats filePath="src/app.tsx" staged={false} />  // in unstaged section
 *
 * // Section totals
 * <SectionDiffStats staged={true} />
 * <SectionDiffStats staged={false} />
 * ```
 */

export {
  FileDiffStatsProvider,
  useFileDiffStats,
  useSectionTotalStats,
  type FileDiffStat,
  type FileDiffStatsProviderProps,
} from "./FileDiffStatsContext";

export {
  DiffStatsDisplay,
  type DiffStatsDisplayProps,
} from "./DiffStatsDisplay";
export { FileDiffStats, type FileDiffStatsProps } from "./FileDiffStats";
export {
  SectionDiffStats,
  type SectionDiffStatsProps,
} from "./SectionDiffStats";
