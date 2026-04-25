// Human: This barrel file re-exports AccountSettingsForm from the `AccountSettingsForm` folder so callers can import them through one path while working on account, privacy, and session settings.
// Agent: SCOPE settings; SECURITY sessions delete-account; RE-EXPORTS AccountSettingsForm; NO runtime logic in this file.
export { AccountSettingsForm } from "./AccountSettingsForm";
