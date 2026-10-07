"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// ============================================================
// ResponsiveDialog — automaticky Drawer (bottom sheet) na mobilu,
// Dialog na desktopu.
// ------------------------------------------------------------
// API kompatibilní s Radix Dialog:
//   <ResponsiveDialog open={open} onOpenChange={setOpen}>
//     <ResponsiveDialogTitle>Titulek</ResponsiveDialogTitle>
//     <ResponsiveDialogDescription>Popis</ResponsiveDialogDescription>
//     <div>...form content...</div>
//     <ResponsiveDialogFooter>...buttons...</ResponsiveDialogFooter>
//   </ResponsiveDialog>
//
// Výhody:
//   - Mobil: bottom sheet (vaul) — lepší thumb reach, swipe-down close
//   - Desktop: centrovaný Dialog s max-w a max-h
//   - Stejný form content uvnitř — žádná duplikace
//   - Konsistentní s Material You (Google používá bottom sheets)
//
// Props:
//   open, onOpenChange — standardní Radix controlled state
//   className — aplikuje se na content (max-w, atd.)
//   children — form content (header/title/description/footer jsou
//     samostatné komponenty níže)
// ============================================================

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  // Max height pro scroll oblast (pouze desktop Dialog)
  // Default: "90vh" — formulář scrolluje pokud je delší
  contentClassName?: string;
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn("max-h-[92vh]", className)}
        >
          {children}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-h-[90vh] overflow-y-auto", className, contentClassName)}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sub-komponenty — sjednocené API pro Drawer i Dialog
// ============================================================

export function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerHeader className={className} {...props} />;
  }
  return <DialogHeader className={className} {...props} />;
}

export function ResponsiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerTitle className={className} {...props} />;
  }
  // Radix DialogTitle renderuje h2, ale očekuje své props — přetypujeme
  return <DialogTitle className={className} {...(props as React.ComponentProps<typeof DialogTitle>)} />;
}

export function ResponsiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerDescription className={className} {...props} />;
  }
  return <DialogDescription className={className} {...(props as React.ComponentProps<typeof DialogDescription>)} />;
}

export function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerFooter className={className} {...props} />;
  }
  return <DialogFooter className={className} {...props} />;
}
