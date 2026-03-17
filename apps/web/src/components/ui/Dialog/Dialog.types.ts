import { HTMLAttributes, ReactNode } from "react";

export interface DialogProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  infoIcon?: ReactNode;
  headerIcon?: ReactNode;
  headerRightContent?: ReactNode;
  zIndex?: number;
  /** When true, removes the default header bottom border (for seamless custom content) */
  hideHeaderBorder?: boolean;
}
