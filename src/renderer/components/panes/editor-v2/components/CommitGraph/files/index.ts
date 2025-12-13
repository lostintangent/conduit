/**
 * Commit Files Module
 *
 * This module contains components for displaying the list of files
 * changed in a commit (shown when a commit row is expanded):
 *
 * - CommitFilesPanel.tsx: Container with header and file list
 * - CommitFilesHeader.tsx: Shows file count and +/- stats
 * - CommitFileItem.tsx: Individual file row with status badge
 *
 * Files are lazy-loaded when a commit is expanded to avoid
 * fetching data for commits the user doesn't explore.
 *
 * @example
 * ```tsx
 * import { CommitFilesPanel } from './files';
 *
 * {isExpanded && (
 *   <CommitFilesPanel
 *     files={node.files}
 *     isLoading={node.isLoadingFiles}
 *     onFileSelect={(file) => showFileDiff(file)}
 *   />
 * )}
 * ```
 */

// Phase 7: File list components
// export { CommitFilesPanel } from './CommitFilesPanel';
// export type { CommitFilesPanelProps } from './CommitFilesPanel';
