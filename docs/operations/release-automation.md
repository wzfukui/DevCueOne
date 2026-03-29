# Release Automation

## Purpose

This note records the packaging and validation automation added for DevCue One so preview builds can be produced with less manual work.

## Current Baseline

- Node.js `22+` is required.
- `electron-builder` is used for packaging.
- Local artifacts are written to `release/`.
- GitHub Actions now validates the app on every push/PR and can build a macOS preview package on demand.
- Current package identity is `devcueone` and the macOS app ID is `one.devcue.app`.

If your local default Node version is older, load `nvm` and switch before packaging:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
```

## Local Commands

Run the full local release flow for the current platform:

```bash
npm run release:local
```

For the preferred local macOS path, use the wrapper that loads `.env.signing.local`,
switches to Node `22` through `nvm` when available, runs signing/notary preflight,
then packages and verifies the generated app bundles:

```bash
npm run release:mac:local
```

Default rule:

- use `npm run release:mac:local` for normal macOS release work
- only drop to `npm run release:local -- --mac ...` when debugging the wrapper or forcing a lower-level path

Useful variants:

```bash
npm run package:dir
npm run package:mac
npm run release:mac:local
npm run release:mac:local:arm64
npm run release:mac:local:x64
npm run package:mac:arm64
npm run package:mac:x64
npm run package:win
npm run package:linux
```

`npm run package:mac` now builds both `arm64` and `x64` preview installers by default so Apple Silicon and Intel Macs can be tested from the same release pass.

If you need signed and notarized macOS builds, keep the credentials outside the repo and follow `./macos-signing-and-notarization.md`.
If Apple notarization needs a retry after packaging, use `npm run notarize:mac:app -- <signed-app-path>`.
The new mac wrapper is still backed by `scripts/release-build.mjs`; it is simply the recommended operator-facing entry point.

The release helper supports these flags:

- `--dir`
- `--mac`
- `--win`
- `--linux`
- `--arm64`
- `--x64`
- `--universal`
- `--skip-lint`
- `--skip-tests`
- `--skip-build`
- `--allow-dirty`

Example:

```bash
npm run release:local -- --mac --skip-tests
npm run release:local -- --mac --x64 --skip-tests
npm run release:mac:local -- --skip-tests
npm run release:mac:local -- --arm64 --skip-post-verify
```

## What The Script Does

`scripts/release-build.mjs` runs this sequence:

1. verify Node.js major version is at least `22`
2. verify the git worktree is clean unless `--allow-dirty` is passed
3. run `npm run lint`
4. run `npm test`
5. run `npm run build`
6. call `electron-builder`
7. print the generated artifacts under `release/`

`scripts/release-macos-local.sh` + `scripts/release-macos-local.mjs` add a simpler mac-only layer on top:

1. load `.env.signing.local` when present
2. switch to Node `22` through `nvm` when available
3. check local code-signing identities when signing is enabled
4. check Apple notary credentials when signing is enabled
5. call `scripts/release-build.mjs` with `--mac`
6. verify the resulting signed `.app` bundles with `codesign` and `spctl`

If `VOICE_AGENT_ENABLE_SIGNING=1` is not set, the helper forces unsigned local preview builds by setting `CSC_IDENTITY_AUTO_DISCOVERY=false`.

That default keeps friend-test preview packaging simple and repeatable.

## Builder Targets

The current `electron-builder.yml` targets are:

- macOS: `dmg`, `zip`
- Windows: `nsis`
- Linux: `AppImage`

This is a preview-distribution baseline, not a fully signed production release pipeline yet.

## GitHub Actions

### Validate

`.github/workflows/validate.yml` runs on push, pull request, and manual dispatch:

- `npm ci`
- `npm run ci:validate`

### Package Preview

`.github/workflows/package-preview.yml` is manual (`workflow_dispatch`) and currently packages macOS preview artifacts:

- `npm ci`
- `npm run release:mac:local`
- upload `release/**` as a workflow artifact

Because the helper defaults mac builds to both `arm64` and `x64`, the workflow now emits both installer families in one run.

## Remaining Production Hardening

The following items are still intentionally left for a later pass:

- CI-managed macOS signing and notarization secrets flow
- Windows signing certificate integration
- final app icon files (`.icns`, `.ico`, `.png`)
- packaged-app permission checklist and install smoke tests
- auto-update channel design

## Recommended Next Step

Once the icon assets exist, drop them into `build/branding/` and wire the exact filenames into `electron-builder.yml`.
