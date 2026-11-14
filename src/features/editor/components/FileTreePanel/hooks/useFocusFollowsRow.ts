import { type RefObject, useCallback, useEffect, useRef } from "react";

export type ChangesSection = "staged" | "unstaged";

interface Landing {
  /** What had focus when the write started */
  from: HTMLElement;
  /** The row it was in, and that row's section */
  path?: string;
  section?: ChangesSection;
  /** The section the row moves to, if it moves */
  to?: ChangesSection;
  /** The other rows in its section, nearest first: after it, then before */
  neighbors: string[];
}

/**
 * Staging, unstaging or reverting from a row in the Changes tree unmounts the
 * row, and focus in it would fall to the body. Instead, focus follows the row
 * to the section it moves to. If it isn't showing there (or was reverted), it
 * lands on the nearest row left in its section, or else a section's header.
 *
 * Focus that wasn't in the tree when the write started, or that moved since,
 * is left alone.
 *
 * @returns Call it as a write starts, with the section the row moves to. It
 * returns the write's onSuccess, or nothing when focus isn't in the tree.
 */
export function useFocusFollowsRow(treeRef: RefObject<HTMLElement | null>) {
  const pending = useRef<Landing | null>(null);

  // The watcher reports a write after it resolves, so its row moves later
  useEffect(() => {
    if (pending.current && settle(treeRef.current, pending.current)) {
      pending.current = null;
    }
  });

  return useCallback(
    (to?: ChangesSection) => {
      const landing = capture(treeRef.current, to);
      if (!landing) return undefined;
      return () => {
        pending.current = settle(treeRef.current, landing) ? null : landing;
      };
    },
    [treeRef],
  );
}

function capture(
  tree: HTMLElement | null,
  to: ChangesSection | undefined,
): Landing | undefined {
  const from = document.activeElement;
  if (!tree || !(from instanceof HTMLElement) || !tree.contains(from)) {
    return undefined;
  }

  const section = from.closest<HTMLElement>("[data-section]");
  const row = from.closest<HTMLElement>("[data-path]");
  const paths =
    section && row
      ? [...section.querySelectorAll<HTMLElement>("[data-path]")].map(
          (element) => element.dataset.path,
        )
      : [];
  const index = paths.indexOf(row?.dataset.path);

  return {
    from,
    path: row?.dataset.path,
    section: section?.dataset.section as ChangesSection | undefined,
    to,
    neighbors: [
      ...paths.slice(index + 1),
      ...paths.slice(0, Math.max(index, 0)).reverse(),
    ].filter((path) => path !== undefined),
  };
}

/** Land focus if it's time to, and return whether the landing is done with. */
function settle(tree: HTMLElement | null, landing: Landing) {
  if (!tree) return true;

  // Until the row moves, however long the watcher takes to report it (a push
  // holds its reports), wait as long as the row keeps focus
  const active = document.activeElement;
  if (landing.from.isConnected) return active !== landing.from;
  if (active && active !== document.body && active !== landing.from) {
    return true;
  }

  findLanding(tree, landing)?.focus();
  return true;
}

function findLanding(tree: HTMLElement, landing: Landing) {
  const findSection = (section?: ChangesSection) =>
    section
      ? tree.querySelector<HTMLElement>(`[data-section="${section}"]`)
      : null;
  const findRow = (section: HTMLElement | null, path?: string) =>
    [...(section?.querySelectorAll<HTMLElement>("[data-path]") ?? [])].find(
      (row) => row.dataset.path === path,
    );

  const destination = findSection(landing.to);
  const source = findSection(landing.section);
  const row =
    findRow(destination, landing.path) ??
    landing.neighbors
      .map((path) => findRow(source, path))
      .find((neighbor) => neighbor !== undefined);

  // A row's first button is its file or folder, and a section's its header
  return (row ?? destination ?? tree).querySelector<HTMLElement>("button");
}
