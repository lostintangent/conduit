# AGENTS.md

Conduit is a macOS-only Electron app that puts terminals, editors and browsers in one workspace. Setup, commands, code layout and releasing are in [docs/development.md](docs/development.md).

## Rules

- Never launch a packaged Conduit directly, not even with `--version`, because it uses the real profile. Use `bun run e2e`, or an isolated launch with a temporary `HOME`, `--user-data-dir` and `--use-mock-keychain`.
- Every bug fix comes with a test that fails without it. Tests wait for a signal, never a fixed sleep, and a flaky test gets a root cause, not a retry.
- Changes land on `main` as fast-forward pushes, once fmt, lint, both checks, the unit tests and the packaged e2e pass.
- Commit messages are a short subject, a blank line, then what changed and why.
- Stop every process you start, like probes, loops and servers, before you report, and check `ps` for leftovers. An orphaned loop skews everyone's timing and perf numbers.
- Write down pre-existing bugs you find instead of fixing them, unless they block your change.
- Don't open issues or pull requests on upstream projects without asking.

## Decisions to keep

- The terminal cursor blinks, and a tab with a running command shimmers.
- Workspaces always autosave and reopen at launch, with no settings.
- Browser panes use their own `persist:browser` session, and every site gets geolocation without a prompt.
