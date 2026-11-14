import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { gitMutations, gitQueries } from "@features/git/client/queries";
import type { GitV2API } from "@features/git/client/GitV2API";
import { getFriendlyGitError } from "../utils/gitErrorMessages";

const notifyOnError = { errorMessage: getFriendlyGitError };

/**
 * Pull and push for a cwd, and whether they or a commit are running there.
 * The tree's toolbar and the review header both show these, so they come from
 * the cwd's writes, not from either component.
 */
export function useGitSync(git: GitV2API) {
  const { data: status } = useQuery(gitQueries.status(git));
  // Until status loads, assume there's an upstream so Publish doesn't flash
  const hasUpstream = status ? !!status.upstream : true;

  const { cwd } = git;
  const isCommitting =
    useIsMutating({ mutationKey: gitMutations.commit(cwd).mutationKey }) > 0;
  const isPulling =
    useIsMutating({ mutationKey: gitMutations.pull(cwd).mutationKey }) > 0;
  const isPushing =
    useIsMutating({ mutationKey: gitMutations.push(cwd).mutationKey }) > 0;
  const isBusy = isCommitting || isPulling || isPushing;

  const { mutate: pull } = useMutation({
    ...gitMutations.pull(cwd),
    meta: notifyOnError,
  });
  const { mutate: push } = useMutation({
    ...gitMutations.push(cwd),
    meta: notifyOnError,
  });

  return {
    hasUpstream,
    isCommitting,
    isPulling,
    isPushing,
    pull: useCallback(() => {
      if (!isBusy) pull();
    }, [isBusy, pull]),
    push: useCallback(() => {
      if (!isBusy) push({ publish: !hasUpstream });
    }, [isBusy, hasUpstream, push]),
  };
}
