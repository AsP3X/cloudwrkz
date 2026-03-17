export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Optional class for the wrapper */
  className?: string;
  /** Checked state */
  checked?: boolean;
  /** Indeterminate state (e.g. "select some") */
  indeterminate?: boolean;
  /** Size variant */
  size?: "sm" | "md";
}
