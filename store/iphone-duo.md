# Native iPhone Duo screenshots

Captured on October 25, 2026 from the installed Forgr 1.3.6 native Debug build
on the dedicated Forgr iPhone Duo QA simulator, running iOS 27.1.
The app uses `@capgo/capacitor-native-navigation` 8.14.0 for the actual UIKit
sidebar and tool selection. No browser demo, generated UI, marketing frame,
crop, resize or compositing is used in these captures.

## Files

- `screenshots/iphone-duo-source`: original native screenshots from
  `agent-device screenshot --pixel-density 3 --normalize-status-bar`.
- `screenshots/iphone-duo`: RGB PNG copies uploaded to Apple.
- `iphone-duo-captures.json`: source and upload SHA-256 checksums and dimensions.
- `iphone-duo-upload.json`: verified Apple screenshot IDs and server MD5 checksums.

Apple rejects PNGs with an alpha channel even when every pixel is opaque.
`bun store/tools/prepare-native-duo.mjs` removes that channel only, preserves
the original captures, and requires ImageMagick's absolute pixel-error metric
to be zero for every converted file. This script requires ImageMagick.

The six screenshots show Home, Habits, Tip Split and a running Focus timer on
the unfolded display, plus Tip Split and Home on the cover display.
Unfolded captures are 2853×2007. Cover captures are 1398×2034.

## Verification

- Native sidebar selections open the matching tool and update the selected icon.
- Marking Drink water done changes the Habits count to one of two.
- A bill of 120 with a 15% tip and three people produces 46.00 each. Values
  remain intact when switching between the cover and unfolded displays.
- The Focus timer starts and pauses through the real native app.
- Opening Settings hides native navigation. Dismissing Settings restores it.
  Animated plugin visibility keeps the hosted WebView mounted during sheets.
- The 42 unit tests, TypeScript check, WebKit layout/inset regression checks
  and native iOS simulator build pass.

The local CoreDevice build cannot confirm hinge angles through its motion
stream. Fold commands still switch the physical display. Display dimensions
and fresh native accessibility snapshots were used to verify those changes.
ESLint remains blocked by the existing TypeScript 7/typescript-eslint mismatch.

## App Store Connect

All six files were uploaded with `asc` 5.16.1 to Forgr, app `6821593688`,
version `1.0`, locale `en-US`, display type `APP_IPHONE_DUO`.
Apple reports `COMPLETE` for every file. Each server checksum matches its local
upload file. The existing `APP_IPHONE_65` and `APP_IPHONE_67` asset IDs and order
are unchanged. The screenshot upload did not submit the app for review.

```bash
asc screenshots validate --path store/screenshots/iphone-duo --device-type IPHONE_DUO
asc screenshots upload --app 6821593688 --version 1.0 --locale en-US \
  --path store/screenshots/iphone-duo --device-type IPHONE_DUO --skip-existing
asc screenshots list --version-localization 686c3ef5-02b7-46b6-be81-e8003cfee05b
```
