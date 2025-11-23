import { runGit } from "../agent/git";

export interface DiffStats {
  added: number;
  removed: number;
  files: number;
}

export async function getGitDiffStats(cwd: string): Promise<DiffStats> {
  try {
    const { stdout } = await runGit(cwd, ["diff", "--numstat", "HEAD"]);

    const lines = stdout.trim().split("\n").filter(Boolean);
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const line of lines) {
      const [added, removed] = line.split("\t");
      if (added !== "-") totalAdded += parseInt(added, 10);
      if (removed !== "-") totalRemoved += parseInt(removed, 10);
    }

    return {
      added: totalAdded,
      removed: totalRemoved,
      files: lines.length,
    };
  } catch (error) {
    console.error("[gitDiffStats] Failed to get diff stats:", error);
    return { added: 0, removed: 0, files: 0 };
  }
}
