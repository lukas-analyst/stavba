// =====================================================================
// PdfExportFooter — extracted from /src/components/pdf-export-dialog.tsx
//
// This module contains the footer of the PDF export dialog, which
// renders the Cancel + Export buttons. Extracted as part of the
// monolithic component split (Task R10b).
// =====================================================================
import { Button } from "@/components/ui/button";
import { Loader2, FileDown } from "lucide-react";

// =====================================================================
// Footer — Cancel + Export buttons
// =====================================================================
export type FooterProps = {
  isExporting: boolean;
  isExportDisabled?: boolean;
  onCancel: () => void;
  onExport: () => void;
  cancelLabel: string;
  exportLabel: string;
  exportingLabel: string;
};

export function PdfExportFooter({
  isExporting,
  isExportDisabled = false,
  onCancel,
  onExport,
  cancelLabel,
  exportLabel,
  exportingLabel,
}: FooterProps) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isExporting}
        className="sm:mr-auto"
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        onClick={onExport}
        disabled={isExporting || isExportDisabled}
        className="sm:flex-1 sm:max-w-[16rem]"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        {isExporting ? exportingLabel : exportLabel}
      </Button>
    </>
  );
}
