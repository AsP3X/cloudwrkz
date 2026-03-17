# Profile View Enhancement — Implementation Plan

**Design language:** Fancy, liquid glass, modern enterprise.  
**Reference:** `CloudwrkzDesign.swift` (glassPanel, glassEffect, CloudwrkzColors), `ProfileMenuPopoverView.swift` (gradient, glass rows, section labels).

---

## Design system reminders

- **Background:** `LinearGradient(colors: [CloudwrkzColors.primary950, CloudwrkzColors.neutral950], ...)` with `.ignoresSafeArea()`.
- **Panels/cards:** `.glassPanel(cornerRadius: 20, tint: CloudwrkzColors.primary500, tintOpacity: 0.04)`; fallback `.glassEffect(.regular.tint(.white.opacity(0.06)), in: RoundedRectangle(cornerRadius: 20))` with stroke overlay.
- **Section labels:** Uppercase, `.font(.system(size: 11, weight: .bold))`, `.tracking(0.8)`, `CloudwrkzColors.neutral500`.
- **Primary text:** `CloudwrkzColors.neutral100`; secondary `neutral400`/`neutral500`.
- **Accents/CTAs:** `CloudwrkzColors.primary400`; destructive `CloudwrkzColors.error500`.
- **Toolbar:** `.toolbarBackground(CloudwrkzColors.neutral950.opacity(0.95))`, `.tint(CloudwrkzColors.primary400)`.
- **Row style:** Reuse the liquid-glass row pattern from `ProfileMenuPopoverView` (glass background, icon + title + subtitle, chevron, subtle border).

---

## Phase 1 — Profile sheet content (read-only)

**Goal:** Turn the profile sheet into a proper account summary without new screens.

### 1.1 Add email and username to ProfileView

- **File:** `ProfileView.swift`
- **Data:** Add `email: String?` and ensure `username` is already passed (it is; add `email` to the initializer).
- **UI:** Below the display name, in the hero area:
  - One line: email (from `email`), style `CloudwrkzColors.neutral400`, smaller font (e.g. 15pt).
  - If `username` is present and differs from display name (e.g. API name vs edited first/last), show as a second line or pill (e.g. “@username” or “Username: …”) in `neutral500`.
- **Design:** Keep the existing gradient and avatar; treat the block as a single “hero” card with optional `.glassPanel` wrapper for the whole header block (avatar + name + email + username) for consistency.

### 1.2 Pass email from ContentView

- **File:** `ContentView.swift`
- **Change:** When presenting `ProfileView`, pass `email: profileEmail` (and keep passing `username: profileUsername`). Add `email` to `ProfileView` initializer and use it in the new subtitle lines.

### 1.3 Member since / last signed in (local-only for now)

- **Storage:** Extend `UserProfileStorage` with optional `firstLoginAt: Date?` (or `memberSince: Date?`) and optionally `lastSignedInAt: Date?`. Set `firstLoginAt` once on first successful login (if nil); set `lastSignedInAt` on every successful login.
- **File:** `ProfileView.swift`
- **UI:** In the same hero section or a small “Account” glass card below:
  - “Member since &lt;formatted date&gt;” when `firstLoginAt` is set (e.g. “Jan 15, 2025”).
  - Optionally “Last signed in &lt;relative time&gt;” (e.g. “Today” or “2 days ago”) from `lastSignedInAt`.
- **Design:** Small, subtle text (`neutral500`), so the sheet stays “fancy” and uncluttered.

### 1.4 App version

- **File:** `ProfileView.swift`
- **UI:** At the very bottom of the scroll content, a single line: “Cloudwrkz &lt;version&gt;” using `Bundle.main.infoDictionary?["CFBundleShortVersionString"]`, style `neutral500`, small font (e.g. 12pt). No glass panel; just text on gradient.

---

## Phase 2 — Edit profile (new screen + persistence)

**Goal:** Let users edit name and profile photo with the same liquid-glass look.

### 2.1 Edit profile screen

- **New file:** `ProfileEditView.swift`
- **Inputs:** First name, last name (and optionally username if you want it editable). Use `CloudwrkzDesign.glassField` for text fields; same gradient background as `ProfileView` and `ProfileMenuPopoverView`.
- **Layout:** NavigationStack, title “Edit Profile”, gradient background, one glass panel (or sectioned panels) containing:
  - Avatar at top (tappable for photo picker).
  - Text fields in glass rows or a single glass panel with `.glassField`-styled `TextField`s.
- **Actions:** Toolbar “Cancel” (leading) and “Save” (trailing). Save writes to `UserProfileStorage` (firstName, lastName, username if applicable) and dismisses; optionally call a callback so `ContentView` can refresh profile state.

### 2.2 Profile photo picker

- **In:** `ProfileEditView.swift` (or a small helper view).
- **Behavior:** Tapping the avatar presents `PhotosPicker` (PhotosUI) and/or camera (UIImagePickerController / camera sheet). On selection, resize/compress image to a reasonable max (e.g. 400pt) and save as JPEG data to `UserProfileStorage.profileImageData`.
- **Design:** Keep the same `ProfileAvatarView` circle and stroke; after picking, the avatar shows the new image.

### 2.3 Wire Edit from ProfileView and refresh

- **File:** `ProfileView.swift`
- **Add:** An “Edit profile” button (e.g. `glassButtonSecondary` or a glass row matching `ProfileMenuPopoverView`’s “View Profile” row) that presents `ProfileEditView` as a sheet (or fullScreenCover).
- **Callback:** When edit sheet dismisses after save, ProfileView should refresh its displayed data. If ProfileView receives bindings or a closure from ContentView to refresh, call it on dismiss so the dashboard avatar and menu also update. Alternatively, use a shared observable (e.g. `@Observable` profile model) or refresh from `UserProfileStorage` in `ProfileView.onAppear` and when the edit sheet dismisses.

### 2.4 ContentView refresh after edit

- **File:** `ContentView.swift`
- **Option A:** Pass a closure into `ProfileView` such as `onDismissEdit: { refreshProfileFromStorage() }` and call it when the edit sheet is dismissed after save.
- **Option B:** Have ProfileView read from `UserProfileStorage` on appear and when its edit sheet dismisses; ContentView already refreshes on `onAppear` and `isMainVisible`, so when the user closes the profile sheet and returns to the dashboard, `onAppear` can refresh. To update while the profile sheet is still open (e.g. after editing and closing the edit sheet), ProfileView needs to either get updated props from ContentView (e.g. parent re-reads storage and passes new props) or read storage itself and observe changes.

---

## Phase 3 — Quick actions and sign out

**Goal:** Match the menu’s “Name, avatar, settings” promise and add sign out on the profile.

### 3.1 Quick action rows (liquid glass)

- **File:** `ProfileView.swift`
- **UI:** Reuse the same row component pattern as `ProfileMenuPopoverView`: icon (SF Symbol), title, subtitle, chevron, in a glass row (`.glassEffect` / `.glassPanel`-style row background, stroke). Add a section label “ACCOUNT” or “ACTIONS” above.
- **Rows to add (placeholders are fine if screens don’t exist yet):**
  - **Edit profile** — opens `ProfileEditView` (sheet).
  - **Account settings** — optional; can push to a future `AccountSettingsView` or open URL (e.g. web account page).
  - **Notifications** — optional; future `NotificationSettingsView` or deep link.
  - **Help** — optional; e.g. open help URL or in-app help.
- **Design:** Same as `MenuRowButton` in `ProfileMenuPopoverView`: `CloudwrkzColors.primary400` for icon, `neutral100` title, `neutral500` subtitle, chevron, row background with liquid glass.

### 3.2 Sign out row

- **File:** `ProfileView.swift`
- **UI:** A separate section (e.g. “SESSION”) with a single row: “Log out” / “Sign out of your account”, destructive style (`CloudwrkzColors.error500` for icon and title), same glass row style.
- **Action:** Call an `onLogout: (() -> Void)?` closure passed from ContentView. ContentView already has `onLogout`; pass it into `ProfileView` so that tapping “Log out” in the sheet triggers the same flow (clear token, dismiss sheets, navigate to splash).

### 3.3 ContentView: pass onLogout into ProfileView

- **File:** `ContentView.swift`
- **Change:** Add `onLogout: onLogout` (or a wrapper that dismisses the profile sheet then runs `onLogout`) to the `ProfileView(...)` call so the profile sheet can sign the user out.

---

## Phase 4 — Role / workspace (when API supports it)

**Goal:** Show role or workspace context like the web dashboard.

### 4.1 API and storage

- **Backend:** If the cloudwrkz API adds a “current user” or “me” endpoint that returns `role` and/or `workspace`/`organization`, add a client method (e.g. in `AuthService` or a new `UserService`) to fetch this.
- **Storage:** Optionally store in `UserProfileStorage` (e.g. `role: String?`, `workspaceName: String?`) and refresh after login or in the dashboard `onAppear`.

### 4.2 ProfileView display

- **File:** `ProfileView.swift`
- **UI:** In the hero or in a small “Context” glass card, show a pill or line: e.g. “Role: Admin” or “Workspace: Acme” using `CloudwrkzColors.primary400` for the value, `neutral500` for the label. Keep it compact so the sheet stays enterprise-clean.

---

## Phase 5 — Accessibility and polish

### 5.1 Accessibility

- **ProfileView & ProfileEditView:**
  - Add `.accessibilityLabel("Profile photo")` (and optionally `.accessibilityHint`) to the avatar.
  - Ensure “Done”, “Cancel”, “Save”, “Edit profile”, “Log out” have clear labels (VoiceOver).
  - Group the hero (avatar + name + email) with `.accessibilityElement(children: .combine)` and a single label, or leave children separate and label each.
- **ProfileAvatarView:** Add `.accessibilityLabel` that describes “Profile photo” or “Avatar for &lt;name&gt;” when used in profile context.

### 5.2 Scroll and layout

- **File:** `ProfileView.swift`
- **Structure:** Use a `ScrollView` so that when you add hero + sections + version + optional role, the content scrolls on small devices. Order: gradient background → ScrollView → hero card → section “ACCOUNT” → quick action rows → section “SESSION” → sign out row → app version at bottom.

### 5.3 Consistency pass

- Ensure all new rows and panels use the same corner radius (20 for panels, 12 for row inner corners if different), stroke opacity (~0.12–0.22), and tint as in `ProfileMenuPopoverView` and `CloudwrkzDesign`.
- Prefer extracting a shared “glass row” component (e.g. `GlassRowButton`) used by both `ProfileMenuPopoverView` and `ProfileView` if duplication grows.

---

## File checklist

| File | Action |
|------|--------|
| `ProfileView.swift` | Add email, username, member since, version; hero glass card; quick action rows; sign out row; Edit button; ScrollView; pass `onLogout`; accessibility. |
| `ProfileEditView.swift` | **New.** Edit name (+ optional username), avatar; photo picker; save to UserProfileStorage; glass fields and gradient. |
| `ContentView.swift` | Pass `email` and `onLogout` to ProfileView; optionally `onProfileUpdated` or rely on refresh on dismiss. |
| `UserProfileStorage.swift` | Add `firstLoginAt`, `lastSignedInAt`; clear in `clear()`. Optionally later: `role`, `workspaceName`. |
| Login flow (e.g. where token is set) | Set `UserProfileStorage.firstLoginAt` if nil; set `UserProfileStorage.lastSignedInAt` on success. |
| `ProfileAvatarView.swift` | Optional: `.accessibilityLabel` for avatar. |
| Shared glass row | Optional: extract `GlassRowButton` (or reuse from menu) for ProfileView and ProfileMenuPopoverView. |

---

## Suggested implementation order

1. **Phase 1.1–1.2** — Email (and username) in ProfileView + ContentView wiring.  
2. **Phase 1.4** — App version at bottom.  
3. **Phase 1.3** — Member since / last signed in (storage + login wiring + UI).  
4. **Phase 2** — Edit profile screen, photo picker, and refresh flow.  
5. **Phase 3** — Quick action rows + sign out + ContentView `onLogout`.  
6. **Phase 5** — ScrollView, accessibility, consistency.  
7. **Phase 4** — Role/workspace when API is ready.

This order delivers visible value quickly (email, version, then edit) and keeps the liquid-glass, modern-enterprise look throughout.
