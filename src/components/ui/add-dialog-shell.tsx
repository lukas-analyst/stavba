"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// AddDialogShell — unified dialog for ALL "Add" operations
// ------------------------------------------------------------
// Same appearance on desktop and mobile (Drawer on mobile,
// Dialog on desktop). Provides:
//   - Borderless title input (text-xl font-bold, works at all breakpoints)
//   - Optional borderless description textarea
//   - Scrollable body for form fields
//   - Sticky footer with Cancel + Submit buttons
//
// Usage:
//   <AddDialogShell
//     open={open}
//     onOpenChange={onOpenChange}
//     titlePlaceholder="Název položky…"
//     titleValue={name}
//     onTitleChange={setName}
//     descriptionPlaceholder="Poznámka…"
//     descriptionValue={note}
//     onDescriptionChange={setNote}
//     submitLabel="Přidat položku"
//     onSubmit={handleSubmit}
//     isSubmitting={isLoading}
//   >
//     {/* form fields */}
//   </AddDialogShell>
// ============================================================

type AddDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Title (borderless, text-xl font-bold)
  titleValue: string;
  onTitleChange: (value: string) => void;
  titlePlaceholder?: string;
  // Description (borderless, text-sm, optional)
  descriptionValue?: string;
  onDescriptionChange?: (value: string) => void;
  descriptionPlaceholder?: string;
  // Optional context line (e.g. "Úkol pod položkou 'XYZ'")
  contextText?: string;
  // Submit
  submitLabel: string;
  onSubmit: () => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  // Width
  maxWidth?: string; // default: max-w-3xl
  // Children = form fields
  children: React.ReactNode;
};

export function AddDialogShell({
  open,
  onOpenChange,
  titleValue,
  onTitleChange,
  titlePlaceholder = "Název…",
  descriptionValue,
  onDescriptionChange,
  descriptionPlaceholder,
  contextText,
  submitLabel,
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  maxWidth = "max-w-3xl",
  children,
}: AddDialogShellProps) {
  const isMobile = useIsMobile();

  // Title input — works at ALL breakpoints because we override
  // both base AND md: variants. The Input component has
  // `text-base md:text-sm` which would override our text-xl
  // on desktop. We fix this by using a raw <input> instead.
  const titleInput = (
    <input
      value={titleValue}
      onChange={(e) => onTitleChange(e.target.value)}
      placeholder={titlePlaceholder}
      autoFocus
      className="w-full border-0 bg-transparent px-0 text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none"
    />
  );

  const descriptionTextarea = onDescriptionChange ? (
    <textarea
      value={descriptionValue ?? ""}
      onChange={(e) => onDescriptionChange(e.target.value)}
      placeholder={descriptionPlaceholder}
      rows={1}
      className="w-full resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none"
    />
  ) : null;

  // Header (title + description + context)
  const header = (
    <div className="space-y-2 px-4 pt-4 pb-4 shrink-0">
      {contextText && (
        <p className="text-xs text-muted-foreground">{contextText}</p>
      )}
      {titleInput}
      {descriptionTextarea}
    </div>
  );

  // Body (form fields — scrollable on mobile)
  const body = (
    <div className={cn("flex-1 overflow-y-auto scrollbar-thin space-y-4 px-4 pb-4", !isMobile && "overflow-visible")}>
      {children}
    </div>
  );

  // Footer (sticky)
  const footer = (
    <div className={cn(
      "flex shrink-0 gap-2 border-t bg-background p-3",
      isMobile ? "sticky bottom-0" : "justify-end",
    )}>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
        Zrušit
      </Button>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || submitDisabled}
        className="flex-1 sm:flex-none"
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("flex max-h-[92vh] flex-col", maxWidth)}>
          {header}
          {body}
          {footer}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[90vh] flex-col gap-0 p-0", maxWidth)}>
        {header}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4">
          {children}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
