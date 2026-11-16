# Developing Conduit

## Setup

Install Node 22.13 or newer, which Electron Forge needs, and [Bun](https://bun.sh) canary (`bun upgrade --canary`). Then run `bun install` and `bun start`. `bun install` also adds a pre-commit hook that lints and formats staged files.

## Checks

- `bun run test` runs the unit tests. Plain `bun test` stops and says so, because each test file needs a fresh global.
- `bun lint` and `bun fmt` lint and format.
- `bun check` typechecks the app, and `bun check -p build` typechecks the build scripts, which run under Bun.
- `bun run package`, then `bun run e2e`, runs the end-to-end tests against the packaged app.

Each e2e launch gets its own temporary home and user data directory. `CONDUIT_E2E_KEEP=1` keeps them, and `CONDUIT_E2E_APP` points at another `Conduit.app`. `CONDUIT_E2E_ARTIFACTS=<dir>` saves each launch's last screenshot, app log and Playwright trace, and CI uploads these when a run fails.

## How the code is organized

Conduit is a thin core plus one folder per feature. The core finds each feature's files by path with `import.meta.glob`, so a feature contributes by putting a file in the right place.

- `src/main.ts` creates the window. `src/main/` holds the rest of the main process: lifecycle, menus, and the socket server for the CLI. `src/main/features.ts` loads every feature's service and startup.
- `src/preload/window/` builds `window.conduit`, and `src/cli/` is the `conduit` command used in Conduit's terminals ([cli.md](cli.md)).
- `src/renderer/` is the React core: the command, keybinding and menu engine in `commands/`, CLI request routing in `cli/`, UI primitives in `ui/`, the Query client in `query.ts` and Store atoms in `createAtom.ts`.
- `src/shared/` holds what main and the renderer both use: the service contract in `rpc.ts`, command IDs, the CLI protocol, and types shared by three or more features.

A feature lives in `src/features/<name>/` and has only the parts it needs:

- `model.ts` holds its types, shared by its main and renderer halves.
- `main/service.ts` default-exports an object of methods. Main serves each as `<name>:<method>`, the preload exposes it as `window.conduit.<name>.<method>()`, and merging `<name>: typeof service` into `Services` in `@shared/rpc` types it for the renderer. Events work the same way: merge them into `Events` in `model.ts`, send them with `emitter("<name>")` from `src/main/events.ts`, and listen with `window.conduit.<name>.on(event, listener)`.
- `main/startup.ts` runs before the window loads, and may return a disposer that quit awaits.
- `client/` is renderer logic, `components/` is React, and `commands.ts` lists palette commands, keybindings and menu items.
- `panes.tsx` renders the feature's pane, whose `type` is the folder name. Its pane type also joins the `Pane` union in `src/features/workbench/model.ts`.
- `cli/command.ts` adds `conduit` subcommands, and `cli/handler.ts` answers them in the renderer. The browser also has `preload/`, which runs in its webviews.

Data that main owns lives in TanStack Query, through the feature's `client/queries.ts`, and main's events keep it fresh. TanStack Store atoms hold only UI state, like tabs, layout and the sidebar, never a copy of something main owns.

## Releasing

1. `bun pm version patch` (or `minor`), then `git push --follow-tags`.
2. `gh workflow run release.yml`.

The workflow runs the tests, then Forge builds, signs, notarizes and publishes a GitHub release for the new version. Installed copies update themselves from this repo's releases. It needs three secrets: `MACOS_SIGNING_CERTIFICATE` (the Developer ID `.p12`, base64), `MACOS_SIGNING_PASSWORD` and `NOTARY_APP_PASSWORD`. The certificate expires on February 1, 2027.
