# macOS Signing And Notarization

This note records the environment-variable based signing flow for DevCue One.

Current packaged app identity:

- package name: `devcueone`
- macOS app ID: `one.devcue.app`

## Why This Exists

DevCue One is packaged in environments that can contain multiple company certificates.
To avoid signing with the wrong legal entity, the release helper now refuses ambiguous Developer ID auto-discovery when more than one Developer ID Application certificate is installed.

Before any local signing or notarization command, use Node `22+`.
If the workstation uses `nvm`, prefer this shell setup first:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
```

## Required Environment Variables

The release helper still uses `VOICE_AGENT_ENABLE_SIGNING=1` as the master switch.

For company-safe signing, set:

```bash
export VOICE_AGENT_ENABLE_SIGNING=1
export VOICE_AGENT_SIGNING_IDENTITY="Exact Legal Company Name (TEAMID)"
```

Important:

- use the exact company name and Team ID
- do not include the `Developer ID Application:` prefix in `VOICE_AGENT_SIGNING_IDENTITY`
- the certificate must already be installed in Keychain Access on the packaging Mac

For notarization via App Store Connect API key, set:

```bash
export VOICE_AGENT_NOTARY_KEY_PATH="/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
export VOICE_AGENT_NOTARY_KEY_ID="XXXXXXXXXX"
export VOICE_AGENT_NOTARY_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

These values stay outside the repository.

## What The Helper Does

When signing is enabled:

1. it enumerates local `Developer ID Application` certificates from Keychain Access
2. it fails fast if multiple signing identities are installed and no explicit company identity is provided
3. it normalizes the signing identity before passing it to `electron-builder`
4. it maps the notarization variables above to the `APPLE_API_*` variables expected by Apple tooling
5. it fails fast if notarization credentials are incomplete or the `.p8` file path does not exist

## Example Commands

Preferred local macOS release command:

```bash
npm run release:mac:local
```

The wrapper automatically:

- loads `.env.signing.local` when present
- switches to Node `22` through `nvm` when available
- checks local signing identities
- checks Apple notary credentials
- packages the app
- verifies the generated `.app` bundles with `codesign` and `spctl`

Default rule:

- start with `npm run release:mac:local`
- only fall back to `npm run release:local -- --mac ...` or direct `notarytool` commands when the wrapper path is failing and you need lower-level diagnosis

Direct packaging examples remain available when you need finer flag control.

Preview packaging, signed and notarized for both Apple Silicon and Intel:

```bash
npm run release:local -- --mac
```

Preview packaging, signed and notarized for Apple Silicon only:

```bash
npm run release:local -- --mac --arm64
```

Preview packaging, signed and notarized for Intel only:

```bash
npm run release:local -- --mac --x64
```

If the packaging phase succeeds but Apple notarization needs a retry, resubmit a fresh zip from the signed app bundle:

```bash
npm run notarize:mac:app -- release/mac-arm64/DevCueOne.app
```

You can start from the checked-in sample file:

```bash
cp env/macos-signing.example.env .env.signing.local
```

Or run the wrapper with explicit release flags:

```bash
npm run release:mac:local -- --arm64
npm run release:mac:local -- --skip-tests
```

## Verification Checklist

Before packaging:

- `security find-identity -v -p codesigning`
- confirm the intended `Developer ID Application` certificate is present
- `xcrun notarytool history --key "$VOICE_AGENT_NOTARY_KEY_PATH" --key-id "$VOICE_AGENT_NOTARY_KEY_ID" --issuer "$VOICE_AGENT_NOTARY_ISSUER"`

After packaging:

- check `release/` for the generated `.dmg` and `.zip`
- verify the bundle signature with `codesign -dv --verbose=2 release/mac-arm64/DevCueOne.app`
- assess Gatekeeper with `spctl --assess --type execute --verbose release/mac-arm64/DevCueOne.app`
- if notarization must be retried, use `scripts/notarize-macos-app.mjs` against the signed `.app` rather than an older unsigned archive
