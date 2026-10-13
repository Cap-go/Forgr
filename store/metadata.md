# App Store Connect: Forgr (iOS)

| Field | Value |
| --- | --- |
| Name | Forgr: Learn by Doing with AI ("Forgr" was taken) |
| Subtitle | Personal tools by chatting |
| Apple ID | 6821593688 |
| Bundle ID | app.capgo.mapp |
| SKU | capgo-mapp-ios |
| Team | UVTJ336J2D |
| Category | Productivity / Developer Tools |
| Privacy | https://capgo.app/privacy/ |
| Support | https://capgo.app/contact/ |
| Marketing | https://forgr.ee |
| TestFlight group | Team (internal, auto distribution) `8fb58134-8ac0-4025-992f-d810950f8cf1` |
| Capgo app | app.capgo.mapp, channel `production` |

Builds: 1.0.0 (1) uploaded 2026-10-11.

## Positioning (App Review 2.5.2 / 4.7)

The listing talks about personal tools and interactive explainers that live
inside Forgr, never about building or publishing apps. Tools are personal, run
only inside Forgr and cannot be published or sold.

- Promotional text: Describe a small tool you wish you had and use it seconds later. Learn ideas with interactive explainers. Runs on your own ChatGPT plan.
- Keywords: tools,personal,ai,chatgpt,assistant,tracker,calculator,timer,learn,explainer,habit,reminder,notes
- Description: see the 1.0 version in App Store Connect (set 2026-10-12 via the API).

# Google Play: Forgr (Android, `app.capgo.mapp`)

- Title: Forgr: Tiny Tools with AI
- Short description (80): Make tiny personal tools by chatting. Learn concepts by playing with them.
- Full description: same text as the App Store description, with "iPhone" replaced by "phone" and "iOS Keychain" by "Android Keystore".
- Category: Productivity. Contact: tori@capgo.app. Privacy policy: https://capgo.app/privacy/
- Graphics: `store/icon/play-icon-512.png`, `store/screenshots/android/feature-graphic.png` (1024x500), phone screenshots `store/screenshots/android/1-6*.png` (1080x1920).
- Promo video needs a YouTube URL: upload `store/video/mapp-app-preview.mp4` as unlisted first.
- Release: `bun run build && bunx cap sync android`, then `./gradlew bundleRelease` with `MAPP_UPLOAD_STORE_FILE`, `MAPP_UPLOAD_STORE_PASSWORD`, `MAPP_UPLOAD_KEY_ALIAS` set (upload key lives outside the repo).
- Regenerate graphics: `OS=android bun shoot-store.mjs && OS=android bun frame-store.mjs && bun feature-graphic.mjs` in `store/tools` with `bun run dev` on port 5181.
