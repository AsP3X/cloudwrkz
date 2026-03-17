export interface RichTextEditorProps {
  value: string; // HTML string
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  minHeight?: string;
  maxHeight?: string;
  showToolbar?: boolean;
  mentionableUsers?: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  onImageUpload?: (file: File) => Promise<string>; // Returns image URL
  allowedFormats?: string[]; // e.g., ['bold', 'italic', 'heading', ...]
  className?: string;
  name?: string;
}
