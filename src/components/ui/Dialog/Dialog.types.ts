import { HTMLAttributes } from "react";

export interface DialogProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
}
