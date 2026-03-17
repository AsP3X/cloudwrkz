# Cloudwrkz iOS App – Compliance Validation Report

**Date:** March 16, 2025  
**Scope:** Apple Developer Program License Agreement & DSGVO (EU GDPR)

---

## Executive Summary

The Cloudwrkz iOS app has been validated against the Apple Developer Program License Agreement and the EU General Data Protection Regulation (DSGVO/GDPR). The app demonstrates **strong baseline compliance** in data handling and security. Several gaps were identified and addressed to achieve full conformity.

---

## 1. Apple Developer Program License Agreement

### 1.1 Section 3.3.3 – Data and Privacy

#### ✅ Compliant Areas

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **3.3.3.A Recordings** | ✅ | Camera used only for QR login; `NSCameraUsageDescription` and `NSFaceIDUsageDescription` present in project.pbxproj with clear purpose strings |
| **3.3.3.B Collection & Use** | ✅ | No user/device data collected without consent; no Advertising Identifier (IDFA); no third-party analytics SDKs; no device fingerprinting |
| **3.3.3.E Advertising Identifier** | ✅ | App does not use Ad Support APIs or IDFA |
| **3.3.3.F Location** | ✅ | `LocationAutocompleteService` uses Nominatim (no device GPS) and server location history; no Core Location; no location permission required |
| **3.3.3.G–M (HealthKit, Face Data, etc.)** | ✅ | Not applicable; Face ID used only for app lock via system API |
| **3.3.2 Regulatory** | ✅ | App complies with applicable laws; no FDA/health claims |

#### ⚠️ Addressed Gaps

| Requirement | Issue | Fix |
|-------------|-------|-----|
| **3.3.3.C Disclosures** | Privacy policy button was a placeholder and did not open a URL | Implemented `UIApplication.shared.open()` for privacy policy URL |
| **3.3.3.C Privacy Policy** | Must provide privacy policy in app/website | Privacy policy link now opens `https://cloudwrkz.com/privacy` (or server-specific URL for on-prem) |

### 1.2 Technical Compliance

- **Keychain:** Auth tokens stored securely in Keychain (`AuthTokenStorage`)
- **UserDefaults:** Used only for preferences and cached profile data (local)
- **Clear cache:** `LocalCacheService.clearAll()` and logout clear user data
- **No executable code download:** App does not download or execute remote code

---

## 2. DSGVO (EU GDPR) Compliance

### 2.1 Legal Basis (Art. 6)

| Processing | Legal Basis | Notes |
|-----------|-------------|-------|
| Account creation (name, email, password) | Contract (Art. 6(1)(b)) | Necessary for performance of the service contract |
| Device metadata (login) | Legitimate interest / Contract | Session identification; disclosed in privacy policy |
| Profile data (local cache) | Contract | Improves UX; user can clear via logout |
| Biometric lock | Consent | User enables in settings |

### 2.2 Information Obligations (Art. 13)

| Requirement | Status |
|-------------|--------|
| Identity of controller | ⚠️ Must be in privacy policy (server-side) |
| Purposes of processing | ⚠️ Must be in privacy policy |
| Legal basis | ⚠️ Must be in privacy policy |
| Recipients | ⚠️ Must be in privacy policy |
| Retention periods | ⚠️ Must be in privacy policy |
| Data subject rights | ⚠️ Must be in privacy policy; in-app link to privacy policy provided |

**Note:** The app provides access to the privacy policy. The policy content itself is the responsibility of the data controller (Cloudwrkz backend/operator).

### 2.3 Consent (Art. 7)

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Freely given | ✅ | Checkbox not pre-ticked |
| Specific | ✅ | Separate consent for privacy policy & terms |
| Informed | ✅ | Links to full documents |
| Unambiguous | ✅ | Explicit checkbox required before registration |

**Fix applied:** Registration now requires explicit consent to Privacy Policy and Terms of Service before account creation.

### 2.4 Data Subject Rights (Art. 15–22)

| Right | In-App Support | Notes |
|-------|----------------|-------|
| Access (Art. 15) | Via server/website | Account data visible in Profile |
| Rectification (Art. 16) | ✅ | Profile edit, change password |
| Erasure (Art. 17) | Via server/website | Logout clears local data; account deletion typically via backend |
| Portability (Art. 20) | Via server/website | Backend responsibility |
| Objection (Art. 21) | Via server/website | Contact in privacy policy |

**Recommendation:** Backend should provide account deletion and data export endpoints; app could add "Request account deletion" in settings linking to support/process.

### 2.5 Data Minimization & Security (Art. 5, 32)

- **Minimization:** Only necessary data collected (name, email, password for registration; device metadata for session)
- **Security:** Keychain for tokens; HTTPS for API; no sensitive data in logs
- **Localization:** German (de), English (en), Russian (ru) – supports EU users

---

## 3. Data Flow Summary

### Data Collected by the App

| Data | Storage | Purpose |
|------|---------|---------|
| Auth token | Keychain | Session authentication |
| Name, email, profile image | UserDefaults (local) | Display, avatar |
| Server config | UserDefaults | API base URL, tenant |
| Account preferences | UserDefaults | Notifications, appearance, language |
| Cached API responses | URLCache, Caches dir | Performance |

### Data Sent to Server

| Data | Endpoint | Purpose |
|------|----------|---------|
| Email, password | POST login/register | Authentication |
| Name | POST register | Account creation |
| Device name, type, OS, browser, userAgent | POST login | Session identification |

---

## 4. Recommendations

### Must Have (for App Store submission)

1. ✅ **Privacy policy URL** – Implemented; ensure `https://cloudwrkz.com/privacy` (or equivalent) is live and DSGVO-compliant
2. ✅ **Registration consent** – Implemented; checkbox for Privacy Policy and Terms
3. **App Store listing** – Include privacy policy URL and data use description in App Store Connect

### Should Have (for full DSGVO compliance)

1. **Backend:** Privacy policy and terms of service documents covering all processing
2. **Backend:** Account deletion and data export (Art. 17, 20)
3. **Backend:** Data processing agreement if using processors (e.g. hosting)
4. **Backend:** Data breach notification process (Art. 33, 34)

### Nice to Have

1. In-app "Request account deletion" linking to support or self-service
2. Optional: Data export from Profile (if backend supports it)

---

## 5. Conclusion

The Cloudwrkz iOS app is **largely compliant** with the Apple Developer Agreement and DSGVO. The following changes were implemented in this validation:

1. **Privacy policy link** – Opens the configured privacy policy URL instead of being a placeholder
2. **Registration consent** – Explicit consent to Privacy Policy and Terms of Service before account creation

Remaining compliance depends on:

- A live, DSGVO-compliant privacy policy at the configured URL
- Backend support for data subject rights (access, erasure, portability)
- Terms of service for the registration consent

---

*This report is a technical validation of the iOS app codebase. Legal review by qualified counsel is recommended for production deployment.*
