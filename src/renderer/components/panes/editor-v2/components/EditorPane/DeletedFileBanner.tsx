/**
 * DeletedFileBanner - Informational banner for deleted files.
 *
 * Shows when viewing a file that has been deleted (git status = "deleted")
 * in "Showing only changed files" mode. The editor displays read-only
 * content from HEAD.
 */

export function DeletedFileBanner() {
  return (
    <div
      className="bg-muted border-b border-border px-3 py-1.5"
      role="status"
      data-testid="deleted-file-banner"
    >
      <span className="text-[13px] text-muted-foreground">
        This file has been deleted. Showing content from HEAD.
      </span>
    </div>
  );
}
