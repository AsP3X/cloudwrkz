// Human: This barrel file re-exports ProfileForm from the `profile` folder so callers can import them through one path while working on end-user profile editing.
// Agent: SCOPE profile; FORM user fields; RE-EXPORTS ProfileForm; NO runtime logic in this file.
export { ProfileForm } from "./ProfileForm";
