// Human: Public props contract for `RichTextEditor`: dual HTML and plain-text change callback plus optional chrome for forms and async image upload.
// Agent: TYPE only; onChange(html, plainText); optional onImageUpload returns Promise<string URL>.
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
