export interface RichTextEditorProps {
  value: string;
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  minHeight?: string;
  showToolbar?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
  className?: string;
  name?: string;
}
