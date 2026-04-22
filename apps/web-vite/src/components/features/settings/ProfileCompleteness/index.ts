// Human: This barrel file re-exports ProfileCompleteness from the `ProfileCompleteness` folder so callers can import them through one path while working on account, privacy, and session settings.
// Agent: SCOPE settings; SECURITY sessions delete-account; RE-EXPORTS ProfileCompleteness; NO runtime logic in this file.
export { ProfileCompleteness } from "./ProfileCompleteness";
