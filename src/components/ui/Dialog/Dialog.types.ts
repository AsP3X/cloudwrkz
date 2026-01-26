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
}
