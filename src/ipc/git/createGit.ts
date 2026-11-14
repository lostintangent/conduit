import { type SimpleGit, simpleGit } from "simple-git";

/**
 * Creates a simple-git instance that runs git with the user's full shell
 * environment, which `hydrateEnvFromLoginShell` loads at startup. simple-git 4
 * otherwise strips every `GIT_*` variable plus `EDITOR`, `PAGER`, and
 * `SSH_ASKPASS`, so settings like `GIT_SSH_COMMAND` or `GIT_AUTHOR_NAME` would
 * work in Conduit's terminals but not in its own git actions.
 */
export function createGit(baseDir?: string): SimpleGit {
  return simpleGit({ baseDir, allowEnvironment: Object.keys(process.env) });
}
