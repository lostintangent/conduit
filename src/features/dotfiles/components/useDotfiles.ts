import type { DotfilesStatus } from "../model";
import { useEffect, useState } from "react";

const { dotfiles } = window.conduit;

export function useDotfiles() {
  const [status, setStatus] = useState<DotfilesStatus>("disabled");
  const [repoPath, setRepoPath] = useState<string | null>(null);

  useEffect(() => {
    // Load the initial status and repo path, and set up listeners
    const unsubscribeStatus = dotfiles.on("statusChanged", setStatus);

    dotfiles.getStatus().then(setStatus);
    dotfiles.getPath().then(setRepoPath);

    return () => {
      unsubscribeStatus();
    };
  }, []);

  return {
    status,
    repoPath,

    fetchDotfiles: dotfiles.fetch,
    createDotfilesRepo: dotfiles.createRepo,
  };
}
