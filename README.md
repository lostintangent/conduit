> [!TIP]
> To install Conduit, grab the latest build from this repo's [releases](https://github.com/lostintangent/conduit/releases).

## ⚙️ Developer setup

1. Clone this repo
1. Run `npm install`
1. Run `npm start`

## 🚀 Releasing

1. `npm version patch && git push --follow-tags`
1. Publish from CI with `gh workflow run release.yml`, or from your Mac with
   `CONDUIT_APPLE_ID_PASSWORD=<app-specific password> GITHUB_TOKEN=$(gh auth token) npm run release`

Either way, Forge builds, signs, notarizes, and publishes the release for the new tag to this repo. Locally, the signing certificate has to be in your login keychain.
