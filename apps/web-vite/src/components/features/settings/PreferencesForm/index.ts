// Human: This barrel file re-exports PreferencesForm from the `PreferencesForm` folder so callers can import them through one path while working on account, privacy, and session settings.
// Agent: SCOPE settings; SECURITY sessions delete-account; RE-EXPORTS PreferencesForm; NO runtime logic in this file.
export { PreferencesForm } from "./PreferencesForm";
