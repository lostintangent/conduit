export type AgentSessionSpawnRequest = {
  cwd: string;
  preferredName?: string;
};

export type AgentSessionInfo = {
  id: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  baseBranch?: string | null;
  createdAt: number;
};

export type AgentSessionFinalizeRequest = {
  sessionId: string;
};

export type AgentSessionFinalizeResult = {
  status: "merged" | "noop" | "conflict";
  message: string;
};

export type AgentSessionCleanupRequest = {
  sessionId: string;
};

export type AgentSessionCleanupResult = {
  status: "removed" | "missing";
  message: string;
};
