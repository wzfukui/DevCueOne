---
name: macos-release
description: Package, sign, notarize, and validate DevCueOne macOS builds with the repo's release scripts. Use this skill when the user wants macOS preview packaging, company-specific Developer ID selection, notarization retries, Gatekeeper validation, or release-status checks for this project.
---

# macOS Release

Use this skill for DevCueOne macOS packaging and release work. This is a project-level skill: always prefer the repo's current scripts, docs, and release assets over generic Electron advice.

Current technical identity for this repo:

- package name: `devcueone`
- macOS app ID: `one.devcue.app`

## Quick Start

Before packaging or notarizing:

1. Read `package.json` for the current scripts and version.
2. Read `docs/operations/release-automation.md` for the packaging baseline.
3. Read `docs/operations/macos-signing-and-notarization.md` for the signing and notarization contract.
4. If the user wants branded output, confirm `build/branding/icon.icns`, `build/branding/icon.ico`, and `build/branding/icon.png` exist.

## Required Rules

- Keep signing secrets out of the repo.
- Use `env/macos-signing.example.env` only as a placeholder template.
- Prefer `.env.signing.local` or shell exports for real values.
- If multiple `Developer ID Application` certificates are installed, always set `VOICE_AGENT_SIGNING_IDENTITY`.
- `VOICE_AGENT_SIGNING_IDENTITY` must not include the `Developer ID Application:` prefix.
- Never assume the correct legal entity. Verify the exact company identity before packaging.

## DevCueOne Local Convention

When this repo is packaged on a workstation with local signing material, prefer a repo-root `.env.signing.local` file that is git-ignored.

If the workstation uses `nvm`, switch to Node 22 before any release or notarization command:

- `export NVM_DIR="$HOME/.nvm"`
- `. "$NVM_DIR/nvm.sh"`
- `nvm use 22`

Load it into the current shell before verification or packaging:

- `set -a; source .env.signing.local; set +a`

That file should contain only the real local values for:

- `VOICE_AGENT_ENABLE_SIGNING`
- `VOICE_AGENT_SIGNING_IDENTITY`
- `VOICE_AGENT_NOTARY_KEY_PATH`
- `VOICE_AGENT_NOTARY_KEY_ID`
- `VOICE_AGENT_NOTARY_ISSUER`

Do not copy those real values into tracked docs, templates, or commit history.

## Default Workflow

Artifact naming convention for this repo:

- branded installer artifacts should use the `DevCue.One` prefix
- expected macOS artifact names are `DevCue.One-<version>-mac-arm64.dmg`, `DevCue.One-<version>-mac-x64.dmg`, and matching `.zip` archives when generated
- the `.app` bundle path used for verification should use `release/mac-arm64/DevCueOne.app` or `release/mac/DevCueOne.app`

### 1. Verify local signing material

Run:

- `security find-identity -v -p codesigning`
- `xcrun notarytool history --key "$VOICE_AGENT_NOTARY_KEY_PATH" --key-id "$VOICE_AGENT_NOTARY_KEY_ID" --issuer "$VOICE_AGENT_NOTARY_ISSUER" --output-format json`

Confirm:

- the intended `Developer ID Application` certificate is installed
- the notarization API key works

### 2. Package with the repo helper

Prefer the mac wrapper first. It loads `.env.signing.local`, switches to Node `22`
through `nvm` when available, runs signing/notary preflight, then packages and verifies:

- `npm run release:mac:local`
- `npm run release:mac:local -- --arm64`
- `npm run release:mac:local -- --x64`

Default rule:

- use the wrapper for normal release work
- only fall back to the lower-level helper when the wrapper path fails or when you explicitly need lower-level diagnosis

The lower-level helper remains available when you need raw control:

- `npm run release:local -- --mac`
- `npm run release:local -- --mac --arm64`
- `npm run release:local -- --mac --x64`

The helper:

- enforces Node 22+
- supports dual-arch mac packaging
- can lock signing to the requested company identity
- maps repo-level notary env vars to Apple tooling
- refuses ambiguous multi-certificate auto-selection

### 3. Verify signed app bundles

After packaging, validate the signed app:

- `codesign --verify --deep --strict --verbose=2 release/mac-arm64/DevCueOne.app`
- `codesign -dv --verbose=2 release/mac-arm64/DevCueOne.app`
- `spctl --assess --type execute --verbose release/mac-arm64/DevCueOne.app`

Interpretation:

- `codesign` passing means the local signature chain is intact
- `spctl` may still say `Unnotarized Developer ID` before stapling

### 4. Retry notarization from a signed app when needed

If packaging succeeds but notarization upload or wait behavior is flaky, do not rebuild everything immediately.

Use:

- `npm run notarize:mac:app -- release/mac-arm64/DevCueOne.app`

This helper:

- creates a fresh notary zip from the already signed `.app`
- submits it to Apple notary service
- waits for completion
- downloads the log on failure
- staples the app on success

### 5. Check notarization state

If the user asks for live status, query the current submission directly:

- `xcrun notarytool history ... --output-format json`
- `xcrun notarytool info <submission-id> ... --output-format json`
- `xcrun notarytool log <submission-id> <output-path> ...`

Report the latest submission separately from older failed or stale submissions.

## Environment Variables

Primary release variables:

- `VOICE_AGENT_ENABLE_SIGNING=1`
- `VOICE_AGENT_SIGNING_IDENTITY="Exact Legal Company Name (TEAMID)"`
- `VOICE_AGENT_NOTARY_KEY_PATH="/absolute/path/to/AuthKey_XXXXXXXXXX.p8"`
- `VOICE_AGENT_NOTARY_KEY_ID="XXXXXXXXXX"`
- `VOICE_AGENT_NOTARY_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`

Fallback Apple-native variables are still supported by the scripts, but prefer the repo-level `VOICE_AGENT_*` names for consistency.

## Deliverables

Depending on the request, produce one or more of:

- packaged `.dmg` / `.zip` artifacts
- signed `.app` validation results
- notarization submission status
- downloaded notary logs
- stapled app confirmation
- concise release notes or operator instructions

## Accuracy Rules

- Treat the repo scripts as the source of truth for packaging behavior.
- Do not claim notarization is complete until Apple returns `Accepted`.
- Do not tell the user a build is production-ready if `spctl` still reports `Unnotarized Developer ID`.
- If release status is uncertain, query Apple notary state directly instead of inferring from local files.
