> [!TIP]
> If you're looking for the intro or installer for Conduit, then head on over to the [Conduit release](https://github.com/lostintangent/conduit-release) repo. This repo is where the source code/active development happens, and ATM, the Conduit project isn't open source.

## ⚙️ Developer setup

1. Clone this repo
1. Run `npm install`
1. Run `npm start`

Additionally, if you want to make use of cloud terminals, you need to also perform the following steps:

1. Generate a [GitHub PAT](https://github.com/settings/personal-access-tokens/new)
1. Define an environment variable called `GITHUB_TOKEN` with the value of the PAT

## 📦 Building and Code Signing

### macOS Code Signing

To enable code signing and notarization for macOS builds, set the following environment variables:

- `CONDUIT_APPLE_ID_PASSWORD` - Your Apple ID app-specific password

### Windows Code Signing

To enable code signing for Windows builds, set the following environment variables:

- `WINDOWS_CERTIFICATE_FILE` - Path to your `.pfx` code signing certificate
- `WINDOWS_CERTIFICATE_PASSWORD` - Password for the certificate
- `WINDOWS_TIMESTAMP_SERVER` - (Optional) Timestamp server URL (defaults to `https://timestamp.digicert.com`)

If these environment variables are not set, the build will proceed without code signing.

## 🧠 Fundamental assumptions

Conduit was born out of the following key assumptions:

1. Developers will _continue to make use of multiple different coding agents_, because no single agent will (ever?) serve all their needs. Therefore, it's critcal to have toolchains that allow a **"learn once, use any agent"** experience.

1. Coding agents will _continue to \_evolve at a rapid pace_, and putting too many abstractions on top of them will creation friction in the availability of innovation. Therefore, developers want to be as **"close to the metal"** as possible with their agents.

1. Coding agents will _continue to get more powerful over time_, and therefore, a CLI interface, along with supporting tools, will be sufficient for most users. Therefore, toolchains should embrace **terminals as being central vs. secondary**.

1. Developers love hackable environments, but with smart defaults. That way they can get started quickly, but without compromising on their flow. Therefore, agentic surfaces must embrace **compsability and personalization at its core**.
