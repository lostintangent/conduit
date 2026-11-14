> [!TIP]
> To install Conduit, grab the latest build from this repo's [releases](https://github.com/lostintangent/conduit/releases).

## ⚙️ Developer setup

1. Install Node 22.17 or newer, which Electron Forge needs
1. Install [Bun](https://bun.sh) canary (`bun upgrade --canary`), which builds and tests the app
1. Clone this repo
1. Run `bun install`
1. Run `bun start`

Run the tests with `bun run test`. Each test file needs a fresh global, so plain `bun test`, which shares one across files, stops and says so. `bun test --isolate` works too, just slower. `bun lint` lints, `bun fmt` formats, `bun check` typechecks the app, and `bun check -p build` typechecks the files that run under Bun. `bun install` sets up a pre-commit hook that fixes lint problems in your staged files and formats them.

## 🚀 Releasing

1. `bun pm version patch && git push --follow-tags`
1. Publish from CI with `gh workflow run release.yml`, or from your Mac with
   `CONDUIT_APPLE_ID_PASSWORD=<app-specific password> GITHUB_TOKEN=$(gh auth token) bun run release`

Either way, Forge builds, signs, notarizes, and publishes the release for the new tag to this repo. Locally, the signing certificate has to be in your login keychain.
