> [!TIP]
> To install Conduit, grab the latest build from this repo's [releases](https://github.com/lostintangent/conduit/releases).

## ⚙️ Developer setup

1. Install Node 22.17 or newer, which Electron Forge needs
1. Install [Bun](https://bun.sh) canary (`bun upgrade --canary`), which builds and tests the app
1. Clone this repo
1. Run `bun install`
1. Run `bun start`

Run the tests with `bun run test`. Each test file needs a fresh global, so plain `bun test`, which shares one across files, stops and says so. `bun test --isolate` works too, just slower. `bun lint` lints, `bun fmt` formats, `bun check` typechecks the app, and `bun check -p build` typechecks the files that run under Bun. `bun install` sets up a pre-commit hook that fixes lint problems in your staged files and formats them.

The end-to-end tests in `e2e/` drive the packaged app, so run `bun run package` and then `bun run e2e`. Each launch gets its own temporary home and user data directory, so it never touches your own Conduit's settings, workspaces or shell history. Set `CONDUIT_E2E_KEEP=1` to keep those homes for debugging, or `CONDUIT_E2E_APP` to test another build of `Conduit.app`. Set `CONDUIT_E2E_ARTIFACTS` to a folder to save each launch's last screenshot, its app log with the window's console, and a Playwright trace you can open at [trace.playwright.dev](https://trace.playwright.dev). CI uploads them when a run fails.

## 🗺️ How the code is organized

Conduit is a thin core plus one folder per feature. The core finds each feature's files by path with `import.meta.glob`, so a feature contributes by putting a file in the right place.

- `src/main.ts` creates the window, and `src/main/` holds the rest of the main process: lifecycle, the application and context menus, and the socket server for the CLI. `src/main/features.ts` loads every feature's service and startup.
- `src/preload/window/` builds `window.conduit`, and `src/cli/` is the `conduit` command you run in Conduit's terminals (see [docs/cli.md](docs/cli.md)).
- `src/renderer/` is the React core: the command, keybinding and menu engine in `commands/`, CLI request routing in `cli/`, UI primitives in `ui/`, the Query client in `query.ts` and Store atoms in `createAtom.ts`.
- `src/shared/` holds what main and the renderer both use: the service contract in `rpc.ts`, command IDs, the CLI protocol, and types that three or more features share.

A feature lives in `src/features/<name>/` and has only the parts it needs:

- `model.ts` holds its types, shared by its main and renderer halves.
- `main/service.ts` default-exports a plain object of methods. Main serves each one as `<name>:<method>`, the preload exposes it as `window.conduit.<name>.<method>()`, and merging `<name>: typeof service` into `Services` from `@shared/rpc` types it for the renderer. Events work the same way: merge them into `Events` in `model.ts`, send them with `emitter("<name>")` from `src/main/events.ts`, and listen with `window.conduit.<name>.on(event, listener)`.
- `main/startup.ts` runs before the window loads, and may return a disposer that quit awaits.
- `client/` is renderer logic, `components/` is React, and `commands.ts` lists palette commands, keybindings and menu items.
- `panes.tsx` renders the feature's pane, whose `type` is the folder name. `cli/command.ts` adds `conduit` subcommands, and `cli/handler.ts` answers them in the renderer. The browser also has `preload/`, which runs in its webviews.

Data that main owns belongs to TanStack Query, through the feature's `client/queries.ts`, and main's events and watchers keep it fresh. TanStack Store atoms hold only UI state, like tabs, layout and the sidebar, never a copy of something main owns.

To add a feature:

1. Create `src/features/<name>/` with a `model.ts` for its types.
2. If it needs the main process, add `main/service.ts`, merge its type into `Services`, and wrap its methods in queries and mutations in `client/queries.ts`.
3. Add what it shows: `components/`, `commands.ts`, `cli/`, or `panes.tsx`, whose pane type also joins the `Pane` union in `src/features/workbench/model.ts`.

## 🚀 Releasing

1. `bun pm version patch && git push --follow-tags`
1. Publish from CI with `gh workflow run release.yml`, or from your Mac with
   `CONDUIT_APPLE_ID_PASSWORD=<app-specific password> GITHUB_TOKEN=$(gh auth token) bun run release`

Either way, Forge builds, signs, notarizes, and publishes the release for the new tag to this repo. Locally, the signing certificate has to be in your login keychain.
