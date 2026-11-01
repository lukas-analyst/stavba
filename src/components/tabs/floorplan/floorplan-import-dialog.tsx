"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File, floorName: string, viewType: "plan" | "elevation") => void;
  isLoading?: boolean;
};

export function FloorplanImportDialog({
  open,
  onOpenChange,
  onImport,
  isLoading,
}: Props) {
  const t = useTranslations("tabs.floorplan");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [floorName, setFloorName] = useState("");
  const [viewType, setViewType] = useState<"plan" | "elevation">("plan");
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".dxf")) {
      setError("Soubor musí mít příponu .dxf");
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
    // Auto-fill floor name from filename
    if (!floorName) {
      const name = file.name.replace(/\.dxf$/i, "");
      setFloorName(name);
    }
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      setError("Vyberte DXF soubor");
      return;
    }
    if (!floorName.trim()) {
      setError("Zadejte název patra");
      return;
    }
    onImport(selectedFile, floorName.trim(), viewType);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelectedFile(null);
      setFloorName("");
      setViewType("plan");
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="type-title-lg flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            {t("import.title")}
          </DialogTitle>
          <DialogDescription className="type-body text-on-surface-variant">
            {t("import.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File selection */}
          <div className="space-y-2">
            <Label htmlFor="dxf-file" className="type-label">
              {t("import.fileLabel")}
            </Label>
            <div
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-outline-variant p-6 hover:bg-surface-container-low"
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? (
                <>
                  <FileText className="h-8 w-8 text-success" />
                  <span className="type-body font-medium">{selectedFile.name}</span>
                  <span className="type-label-sm text-on-surface-variant">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-on-surface-variant" />
                  <span className="type-body text-on-surface-variant">
                    {t("import.dropzone")}
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="dxf-file"
              type="file"
              accept=".dxf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Floor name */}
          <div className="space-y-2">
            <Label htmlFor="floor-name" className="type-label">
              {t("import.floorNameLabel")}
            </Label>
            <Input
              id="floor-name"
              value={floorName}
              onChange={(e) => setFloorName(e.target.value)}
              placeholder={t("import.floorNamePlaceholder")}
              className="type-body"
            />
          </div>

          {/* View type */}
          <div className="space-y-2">
            <Label className="type-label">
              {t("import.viewTypeLabel")}
            </Label>
            <div className="flex gap-2">
              <button
                onClick={() => setViewType("plan")}
                className={`flex-1 rounded-lg border px-3 py-2 type-body transition-colors ${
                  viewType === "plan"
                    ? "border-primary bg-primary-container text-primary-foreground"
                    : "border-outline-variant hover:bg-surface-container-low"
                }`}
              >
                {t("import.viewTypePlan")}
              </button>
              <button
                onClick={() => setViewType("elevation")}
                className={`flex-1 rounded-lg border px-3 py-2 type-body transition-colors ${
                  viewType === "elevation"
                    ? "border-primary bg-primary-container text-primary-foreground"
                    : "border-outline-variant hover:bg-surface-container-low"
                }`}
              >
                {t("import.viewTypeElevation")}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft/10 p-2.5 type-label text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isLoading}
          >
            {t("import.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedFile}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("import.importing")}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {t("import.import")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
