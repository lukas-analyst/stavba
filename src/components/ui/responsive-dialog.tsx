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

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  children,
  className,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("max-h-[92vh]", className)}>
          {children}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", className)}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerHeader className={className} {...props} />;
  return <DialogHeader className={className} {...props} />;
}

export function ResponsiveDialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTitle className={className} {...props} />;
  return <DialogTitle className={className} {...(props as React.ComponentProps<typeof DialogTitle>)} />;
}

export function ResponsiveDialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerDescription className={className} {...props} />;
  return <DialogDescription className={className} {...(props as React.ComponentProps<typeof DialogDescription>)} />;
}

export function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerFooter className={className} {...props} />;
  return <DialogFooter className={className} {...props} />;
}
