# AGENTS.md

Conduit is a macOS-only Electron app: a terminal, editor and browser workspace. [docs/development.md](docs/development.md) covers setup, how the code is organized, and releasing. Read it first.

## Working on the code

- The toolchain is Bun canary. Run the unit tests with `bun run test`, not plain `bun test`, and keep `bun fmt`, `bun lint`, `bun check` and `bun check -p build` clean.
- The end-to-end suite drives the packaged app: `bun run package`, then `bun run e2e`. It gives each launch its own temporary home and user data directory.
- Never launch a packaged Conduit directly, not even with `--version`, because it runs against the real profile. Use the e2e harness, or an isolated launch with a temporary `HOME`, `--user-data-dir` and `--use-mock-keychain`.
- Every bug fix comes with a test that fails without it. Tests wait for a signal, never a fixed sleep.
- A flaky test gets a root cause, not a retry or a longer timeout.
- Work in your own clone, not in a worktree of someone else's checkout.

## Landing changes

- Changes land on `main` as fast-forward pushes, after fmt, lint, check, the unit tests and the packaged e2e pass.
- A commit subject is one short line, followed by a blank line and a body that says what changed and why.
- Pre-existing bugs you find along the way get written down, not fixed, unless they block the change or the user asks.
- Don't file issues or pull requests on upstream projects without asking.

## Releases

Releases are built, signed, notarized and published by `.github/workflows/release.yml`, and installed copies update themselves from this repo's releases. See [docs/development.md](docs/development.md#-releasing) for the steps. The workflow needs the `MACOS_SIGNING_CERTIFICATE`, `MACOS_SIGNING_PASSWORD` and `NOTARY_APP_PASSWORD` secrets. The Developer ID certificate expires on February 1, 2027.

## Decisions to keep

- The terminal cursor blinks, and a tab with a running command shimmers.
- Workspaces always autosave, and relaunching reopens the last one. There are no workspace settings.
- Pages in browser panes use their own `persist:browser` session, and every site gets geolocation without a prompt.
