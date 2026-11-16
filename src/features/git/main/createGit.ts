import { type SimpleGit, simpleGit } from "simple-git";

/**
 * Creates a simple-git instance that runs git with the user's full shell
 * environment, which `hydrateEnvFromLoginShell` loads at startup. simple-git 4
 * otherwise strips every `GIT_*` variable plus `EDITOR`, `PAGER`, and
 * `SSH_ASKPASS`, so settings like `GIT_SSH_COMMAND` or `GIT_AUTHOR_NAME` would
 * work in Conduit's terminals but not in its own git actions.
 *
 * Git also runs with `--no-optional-locks`. Otherwise every background status
 * holds `.git/index.lock` while it runs, and the user's own `git add` or
 * `git commit` fails if it lands then. Writes still take the locks they need.
 * simple-git has no option for git's own flags, so it rides in the binary's
 * prefix, the slot meant for `wsl git`. Porcelain `git diff` can still lock
 * briefly to save stat info for files touched without changes, because git
 * doesn't count that as optional.
 */
export function createGit(baseDir?: string): SimpleGit {
  return simpleGit({
    baseDir,
    allowEnvironment: Object.keys(process.env),
    binary: ["git", "--no-optional-locks"],
  });
}
