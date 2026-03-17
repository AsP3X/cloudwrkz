Cloudwrkz iOS App – Improvement List
Security
Keychain access level
AuthTokenStorage doesn’t set kSecAttrAccessible. Consider kSecAttrAccessibleWhenUnlockedThisDeviceOnly so the token isn’t included in backups or restorable on other devices.

No certificate pinning
All API calls use URLSession.shared with default TLS. For higher assurance (e.g. on‑prem), consider certificate or public-key pinning.

Language restart via exit(0)
In AccountSettingsView, changing language triggers exit(0). That can conflict with App Store guidelines and looks abrupt. Prefer explaining that the app should be restarted and letting the user quit from the app switcher (or document the need for a restart clearly).

Sensitive data in storage
UserProfileStorage and AccountSettingsStorage use UserDefaults for profile and preferences. For highly sensitive fields (if any are added), consider Keychain or Data Protection.

Functionality
DataRightsService always reports success
In DataRightsService.swift, both requestDataExport and requestAccountDeletion use return true after the success check, so they return true even when the server returns 4xx/5xx or the request fails. Fix by returning the actual success/failure (e.g. only return true when status is in 200...299, otherwise return false and optionally surface an error).

Push notifications not implemented
AccountSettingsStorage.notificationsEnabled is persisted and toggled in Account Settings and Profile, but there is no APNs registration or token handling. The toggle has no effect until push is implemented and synced with this setting.

Email digest preference not synced
emailDigestEnabled is stored locally only. If the backend supports it, add an API call (e.g. in ProfileService.updatePreferences or similar) to sync this preference.

Display language sync
syncDisplayLanguageToServer is used for language; confirm the backend actually uses this and that the path/contract matches (e.g. locale parameter name and values).

Features
Profile → Notifications
The “Notifications” row in Profile is a placeholder (“future NotificationSettingsView”). Either implement a Notification settings screen (and optionally wire it to the push toggle) or remove/hide the row until it’s implemented.

Profile → Help
The “Help” row has an empty action (“Placeholder: open help URL”). Add opening a help URL (e.g. in Safari) or in-app help, and consider making the URL configurable (e.g. from ServerConfig or a remote config).

Push notifications
Add full push flow: request permission, register with APNs, send token to backend, and respect AccountSettingsStorage.notificationsEnabled when registering or sending the token.

Optional: “Home” dashboard
DashboardSection.home exists but is excluded from visibleMenuSections, so “Home” never appears in the quick-access menu. If you want a dedicated Home screen (e.g. summary or shortcuts), add it to the menu and a real destination; otherwise the current behavior is consistent.

Issues
DataRightsService return value
Same as in Functionality: fix so export and deletion requests return success only when the server responds with success (e.g. 2xx); otherwise return false and handle errors in the UI (e.g. show “Request failed” or retry).

exit(0) for language change
As under Security: replace with a clear “Please restart the app” message and avoid calling exit(0).

Profile sheet and environment
AccountSettingsView() is presented without explicit appState; it relies on @Environment(\.appState). This is fine as long as the sheet is presented from a view that already has appState in the environment (e.g. from ContentView/ProfileView under RootView). No change needed unless you later present AccountSettings from a context that doesn’t have appState.

Error handling for export/delete
After fixing DataRightsService, Account Settings should show different UI for “request sent” vs “request failed” (e.g. alert or banner) so users aren’t told success when the request actually failed.

Non-connected UI elements
Profile → Notifications
ProfileGlassRowButton for “Notifications” has an empty action (// Placeholder: future NotificationSettingsView). Tapping does nothing. Connect to a real screen or remove the row.

Profile → Help
ProfileGlassRowButton for “Help” has an empty action (// Placeholder: open help URL). Connect to a help URL or in-app help.

Dashboard “Home”
“Home” is not in the quick-access list by design. The only way to reach a .home destination would be programmatic push; that would show DashboardSectionPlaceholderView (“Coming soon”). If that’s intentional, no change; if you want a real Home, add a proper destination and optionally a menu entry.

Account Settings → appearance
Appearance is stored in AccountSettingsStorage.appearance and read in CloudwrkzApp via @AppStorage("cloudwrkz.account.appearance"). Ensure the key is the same in both places (currently AccountSettingsStorage uses appearanceKey = "cloudwrkz.account.appearance" and the app uses the same string), so the UI and app behavior stay in sync. No bug found; just something to keep consistent if you rename keys.

Quick reference – suggested code fix (DataRightsService)
In DataRightsService.swift, replace the incorrect return true after the status check with a proper success/failure return. For example, for requestDataExport:

Only return true when (200...299).contains(http.statusCode).
Otherwise return false (and optionally set or return an error message for the UI).
Apply the same pattern in requestAccountDeletion.

I can propose a concrete patch for DataRightsService.swift and/or for the Profile “Help” and “Notifications” actions if you want to implement these next.