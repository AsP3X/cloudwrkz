// Human: This barrel file re-exports RichTextDisplay, RichTextDisplayProps from the `RichTextDisplay` folder so callers can import them through one path while working on support tickets and related tooling.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; RE-EXPORTS RichTextDisplay, RichTextDisplayProps; NO runtime logic in this file.
export { RichTextDisplay } from "./RichTextDisplay";
export type { RichTextDisplayProps } from "./RichTextDisplay";
