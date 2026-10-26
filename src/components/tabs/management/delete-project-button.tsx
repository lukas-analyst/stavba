"use client";

// ============================================================
// DeleteProjectButton — destructive action with confirmation dialog
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx`. Behavior is unchanged.
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
};

export function DeleteProjectButton({ projectId, projectName }: DeleteProjectButtonProps) {
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations("tabs.management.deleteProject");

  const handleDelete = async () => {
    if (confirmName !== projectName) {
      toast.error(t("toasts.nameMismatch"));
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toasts.error"));
      }
      toast.success(t("toasts.success"));
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.error"));
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="rounded-full gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle", { name: projectName })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={projectName} className="h-9" autoFocus />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmName("")}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={confirmName !== projectName || deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("confirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
