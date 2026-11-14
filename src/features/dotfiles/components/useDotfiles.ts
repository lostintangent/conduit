import type { DotfilesStatus } from "@shared/types";
import { useEffect, useState } from "react";

const api = window.conduit;

export function useDotfiles() {
  const [status, setStatus] = useState<DotfilesStatus>("disabled");
  const [repoPath, setRepoPath] = useState<string | null>(null);

  useEffect(() => {
    // Load the initial status and repo path, and set up listeners
    const unsubscribeStatus = api.onDotfilesStatusChanged(setStatus);

    api.getDotfilesStatus().then(setStatus);
    api.getDotfilesRepoPath().then(setRepoPath);

    return () => {
      unsubscribeStatus();
    };
  }, []);

  return {
    status,
    repoPath,

    fetchDotfiles: api.fetchDotfiles,
    createDotfilesRepo: api.createDotfilesRepo,
  };
}
