<img src="assets/icon-only.png" width="64" height="64" alt="">

# Forgr

Personal app builder for iOS and Android (Capacitor 8 + Capgo). Sign in with ChatGPT, describe an app, and the AI builds it on your phone. Each user owns their apps locally.

- **Sign in with ChatGPT** (OAuth 2 + PKCE, plan usage scopes), same flow as Capgo Browser. Tokens in Keychain/Keystore.
- **Builder agent** on the OpenAI Responses API with the user's plan token. Tools in the `mapp` namespace: list/read/create/write/edit apps, open app, read runtime logs, and bundled **Capgo skills** (`src/skills/*.md`).
- **Mini apps** are single-file HTML documents stored with `@capacitor/filesystem`, run in a sandboxed iframe with `window.mapp` (storage, haptics, camera, location, notifications, share, clipboard, native HTTP, `ai.chat`). Every change is versioned, Undo restores the previous one.
- **Three-finger pinch** inside any app opens the switcher: Home, Edit (floating chat), or another app. Spread to go back.
- **Home Screen widget** (`@capgo/capacitor-widget-kit`): Settings → Quick Launch pins tools as buttons. The widget needs iOS 17 or later and is available on Android. Layouts are Open (one tap opens Forgr), Tiny, Regular and Big, on a small, medium or large widget.
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

## Store assets

`store/screenshots/{6.9,6.5}` (framed) and `store/video/mapp-app-preview.mp4`
(886x1920, 30 fps) are uploaded to the 1.0 version in App Store Connect.
Regenerate with the dev server on port 5181:

```bash
cd store/tools
bun shoot-store.mjs      # raw 1320x2868 screens (store demo mode)
bun frame-store.mjs      # framed 6.9" and 6.5" screenshots
bun record-preview.mjs   # preview footage, then encode with ffmpeg (see git log)
```

### iPhone Duo

`@capgo/capacitor-native-navigation` provides the real UIKit tool navigation.
The native sidebar is enabled only in expanded layouts, with both viewport
dimensions at least 600 points. Regular iPhones and the folded Duo keep the
original bar-free interface, including in phone landscape. Selecting a tool
preserves its own conversation.
Web sheets and onboarding temporarily hide the native chrome. Plugin insets
are applied to both the shell and running mini apps.

The shell supports portrait and landscape, with an adaptive tool grid and
side-by-side onboarding. Folding resets the floating chat button into the
current screen's safe area. WebKit layout checks can be run with the dev
server on port 5181 using `cd store/tools && bun check-iphone-duo.mjs`.

`store/screenshots/iphone-duo` contains unframed captures from the installed
native app on the iOS 27.1 simulator, with no store-demo mode. Cover captures
are 1398×2034 and unfolded captures are 2853×2007. See
`store/iphone-duo.md` and `store/iphone-duo-upload.json` for provenance and
App Store Connect status.

Upload through the App Store Connect CLI using the existing authenticated
Keychain profile:

```bash
asc screenshots validate --path store/screenshots/iphone-duo --device-type IPHONE_DUO
asc screenshots upload --app 6821593688 --version 1.0 --locale en-US \
  --path store/screenshots/iphone-duo --device-type IPHONE_DUO --skip-existing
```

This uploads screenshots to the draft listing without submitting it for review.
The existing 6.5-inch and 6.9-inch screenshot sets are not replaced.
