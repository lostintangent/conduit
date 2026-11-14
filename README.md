> [!TIP]
> To install Conduit, grab the latest build from this repo's [releases](https://github.com/lostintangent/conduit/releases).

## ⚙️ Developer setup

1. Install Node 22.17 or newer, which Electron Forge needs
1. Install [Bun](https://bun.sh) canary (`bun upgrade --canary`), which builds and tests the app
1. Clone this repo
1. Run `npm install`
1. Run `npm start`

Run the tests with `bun run test`. Plain `bun test` doesn't isolate test files from each other, which the tests need. `bun lint` lints, `bun check` typechecks the app, and `bun check -p build` typechecks the files that run under Bun.

## 🚀 Releasing

1. `npm version patch && git push --follow-tags`
1. Publish from CI with `gh workflow run release.yml`, or from your Mac with
   `CONDUIT_APPLE_ID_PASSWORD=<app-specific password> GITHUB_TOKEN=$(gh auth token) npm run release`

Either way, Forge builds, signs, notarizes, and publishes the release for the new tag to this repo. Locally, the signing certificate has to be in your login keychain.
