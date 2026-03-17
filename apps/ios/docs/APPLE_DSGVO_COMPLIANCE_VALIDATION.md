# Apple Developer Agreement + DSGVO Compliance Validation

Date: 2026-03-16  
Repository: `Cloudwrkz` iOS app

## Scope

This validation checks the current app implementation against:

1. **Apple Developer Program License Agreement** (uploaded PDF)
2. **DSGVO / GDPR (EU 2016/679)** (uploaded PDF)

It is a technical compliance review of the iOS client codebase. It is **not legal advice** and does not replace a legal review of backend processing, contracts, or App Store Connect metadata.

## Key legal anchors used

### Apple Agreement (uploaded PDF)

- Schedule 1 requires developer metadata to include **privacy policy** (`...metadata will include ... (v) Your privacy policy`) — see lines around `4893`.
- For user data provided by Apple, use must comply with a publicly posted privacy policy and user consent — see lines around `4971-4981`.
- Developer remains responsible for legal compliance of the app and disclosures — see lines around `3275-3278` and Schedule 1 responsibility sections.

### DSGVO / GDPR (uploaded PDF)

- Art. 17 right to erasure — lines around `2515-2553`.
- Art. 20 data portability — lines around `2584-2599`.
- Art. 25 privacy by design/default — lines around `2710-2725`.
- Art. 44+ transfer to third countries/international organizations — lines around `3338-3443`.

## Implementation evidence (current code)

- Token storage in Keychain: `Cloudwrkz/Auth/AuthTokenStorage.swift`
- Local cache clearing and logout data cleanup:
  - `Cloudwrkz/Core/LocalCacheService.swift`
  - `Cloudwrkz/App/RootView.swift` (`clearAllUserDataAndCache`)
- Biometric lock opt-in and Face ID usage description:
  - `Cloudwrkz/Session/BiometricService.swift`
  - `Cloudwrkz.xcodeproj/project.pbxproj`
- Camera usage description for QR login:
  - `Cloudwrkz.xcodeproj/project.pbxproj`
  - `Cloudwrkz/Auth/QrLoginScannerView.swift`

## Findings and status

### Fixed in this change set

1. **Privacy policy action was a placeholder (non-functional)**
   - Previous state: "Privacy policy" row did nothing in settings.
   - Change: implemented opening a privacy policy URL from settings (`AccountSettingsView`).

2. **Third-party location query sharing was not user-controlled**
   - Previous state: typed location queries were always sent to OpenStreetMap Nominatim when query length >= 3.
   - DSGVO impact: weaker Art. 25 privacy-by-default posture and weak transparency for third-country transfers.
   - Change:
     - Added setting `thirdPartyLocationSuggestionsEnabled` (**default off**) in `AccountSettingsStorage`.
     - Updated autocomplete service and field view so third-party suggestions are only used when explicitly enabled.
     - Added UI toggle and localized text (EN/DE/RU).

3. **Photo library privacy string**
   - Added `NSPhotoLibraryUsageDescription` in project build settings to align permissions disclosures with profile photo selection.

### Still requires product/legal/backend follow-up

1. **DSGVO rights execution (Art. 15/16/17/20)**
   - App currently has no explicit in-app flow for:
     - data export request,
     - deletion request,
     - rectification support workflow.
   - This may be handled server-side, but user-facing process and support path should be documented and reachable in-app.

2. **Cross-border data transfer legal basis**
   - If third-party services (e.g., Nominatim or self-hosted servers outside EU) process personal data, SCC/adequacy and policy disclosure must be covered by the controller’s privacy documentation.

3. **App Store Connect metadata verification**
   - Apple requires privacy policy metadata in submission flow; confirm this is set in App Store Connect for release artifacts.

## Overall validation result

- **Technical baseline:** improved; key privacy gaps in app behavior were addressed.
- **Current status:** **Partially conformant**.
- **Ship recommendation:** proceed only after confirming backend/legal items above (especially DSGVO data subject rights operations and public privacy documentation).
