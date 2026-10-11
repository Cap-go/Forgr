<img src="assets/icon.svg" width="64" height="64" alt="">

# Mapp

Personal app builder for iOS and Android (Capacitor 8 + Capgo). Sign in with ChatGPT, describe an app, and the AI builds it on your phone. Each user owns their apps locally.

- **Sign in with ChatGPT** (OAuth 2 + PKCE, plan usage scopes), same flow as Capgo Browser. Tokens in Keychain/Keystore.
- **Builder agent** on the OpenAI Responses API with the user's plan token. Tools in the `mapp` namespace: list/read/create/write/edit apps, open app, read runtime logs, and bundled **Capgo skills** (`src/skills/*.md`).
- **Mini apps** are single-file HTML documents stored with `@capacitor/filesystem`, run in a sandboxed iframe with `window.mapp` (storage, haptics, camera, location, notifications, share, clipboard, native HTTP, `ai.chat`). Every change is versioned, Undo restores the previous one.
- **Three-finger pinch** inside any app opens the switcher: Home, Edit (floating chat), or another app. Spread to go back.
- **Capgo live updates** (`@capgo/capacitor-updater`, app `app.capgo.mapp`, channel `production`) ship shell updates OTA.

## Develop

```bash
bun install
bun run dev        # web shell on Vite
bun test
bun run build && bunx cap sync
```

## Ship

```bash
# OTA (JS/CSS only)
bun run build && bunx @capgo/cli bundle upload app.capgo.mapp --channel production --delta --min-update-version 1.1.0

# Native (TestFlight)
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/mapp.xcarchive archive -allowProvisioningUpdates
xcodebuild -exportArchive -archivePath /tmp/mapp.xcarchive -exportOptionsPlist <upload plist> \
  -exportPath /tmp/mapp-export -allowProvisioningUpdates
```

Use the App Store Connect admin API key (`-authenticationKey*` flags) for cloud signing.

## Layout

```
src/auth/*     Sign in with ChatGPT (from Capgo Browser)
src/ai/*       Responses API client, agent loop, tools, instructions
src/apps/*     Mini app store, iframe runtime + native bridge, starter apps
src/ui/*       Shell: home, stage, switcher, floating chat, onboarding
src/skills/*   Capgo skills bundled for the model
store/icon     1024 icon
```
