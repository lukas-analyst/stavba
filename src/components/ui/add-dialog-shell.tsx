"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
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
import { useTranslations } from "next-intl";

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
  // Max characters for description (shows counter)
  descriptionMaxLength?: number;
  // Max visible rows before scrollbar appears
  descriptionMaxRows?: number;
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
  descriptionMaxLength,
  descriptionMaxRows = 3,
  contextText,
  submitLabel,
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  maxWidth = "max-w-3xl",
  children,
}: AddDialogShellProps) {
  const isMobile = useIsMobile();
  const tc = useTranslations("common");

  // ─── Mobile keyboard handling ──────────────────────────────────
  // When the soft keyboard opens on mobile, the visualViewport
  // shrinks. We track its height and use it to set the drawer's
  // max-height, so the footer (sticky bottom) stays visible above
  // the keyboard. Without this, the sticky footer gets hidden
  // behind the keyboard on iOS Safari.
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!isMobile || !open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [isMobile, open]);

  // Scroll the focused input/textarea/select into view when the
  // keyboard appears, so the active field isn't covered.
  useEffect(() => {
    if (!isMobile || !open) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        // Defer to allow the keyboard to finish animating.
        setTimeout(() => {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 300);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [isMobile, open]);

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
      className="w-full border-0 bg-transparent px-0 type-headline text-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none"
    />
  );

  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea when value changes (not just on user input).
  // Without this, editing an item with a multi-line note shows only 1 row.
  useEffect(() => {
    const el = descriptionTextareaRef.current;
    if (!el || !descriptionValue) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, (descriptionMaxRows ?? 3) * 24)}px`;
  }, [descriptionValue, descriptionMaxRows, open]);

  const descriptionTextarea = onDescriptionChange ? (
    <div className="space-y-1">
      <textarea
        ref={descriptionTextareaRef}
        value={descriptionValue ?? ""}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder={descriptionPlaceholder}
        maxLength={descriptionMaxLength}
        rows={1}
        className="w-full resize-none border-0 bg-transparent px-0 type-body text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none"
        style={{
          maxHeight: `${descriptionMaxRows * 1.5}rem`,
          overflow: "auto",
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, descriptionMaxRows * 24)}px`;
        }}
      />
      {descriptionMaxLength && (
        <div className="type-label-sm text-muted-foreground/50 text-right tabular-nums">
          {(descriptionValue ?? "").length}/{descriptionMaxLength}
        </div>
      )}
    </div>
  ) : null;

  // Header (title + description + context)
  const header = (
    <div className="space-y-2 px-4 pt-4 pb-4 shrink-0">
      {contextText && (
        <p className="type-label text-muted-foreground">{contextText}</p>
      )}
      {titleInput}
      {descriptionTextarea}
    </div>
  );

  // Body (form fields — scrollable on mobile)
  // `data-vaul-no-drag` tells Vaul to NOT interpret touches inside this
  // area as drawer-drag gestures — allowing native scroll to work for
  // long forms and Select dropdowns.
  const body = (
    <div
      data-vaul-no-drag
      className={cn("flex-1 overflow-y-auto scrollbar-thin space-y-4 px-4 pb-4 overscroll-contain", !isMobile && "overflow-visible")}
    >
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
        {tc("cancel")}
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
    // When the keyboard is open, use the visualViewport height
    // (smaller than dvh) so the drawer fits above the keyboard.
    // Otherwise fall back to 92dvh (full height minus safe area).
    const drawerMaxHeight = viewportHeight != null ? `${viewportHeight}px` : "92dvh";
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn("flex flex-col", maxWidth)}
          style={{ maxHeight: drawerMaxHeight }}
        >
          {header}
          {body}
          {footer}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl", maxWidth)}>
        {header}
        <div className="flex-1 space-y-4 overflow-y-auto scrollbar-thin px-4 pb-4">
          {children}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
