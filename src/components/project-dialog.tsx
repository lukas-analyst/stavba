"use client";

import { AddDialogShell } from "@/components/ui/add-dialog-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProject, useUpdateProject, type Project } from "@/lib/api";
import { toast } from "sonner";
import { useState } from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
};

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  if (!open) return null;
  return (
    <ProjectForm
      key={project?.id ?? "new"}
      project={project}
      onDone={() => onOpenChange(false)}
    />
  );
}

function ProjectForm({
  project,
  onDone,
}: {
  project?: Project | null;
  onDone: () => void;
}) {
  const t = useTranslations("dialogs.project");
  const tStatuses = useTranslations("statuses");
  const createProject = useCreateProject();
  const updateProject = useUpdateProject(project?.id ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [address, setAddress] = useState(project?.address ?? "");
  const [status, setStatus] = useState(project?.status ?? "planning");
  const [startDate, setStartDate] = useState(
    project?.startDate ? project.startDate.substring(0, 10) : "",
  );
  const [endDate, setEndDate] = useState(
    project?.endDate ? project.endDate.substring(0, 10) : "",
  );

  const isEditMode = !!project;
  const isLoading = createProject.isPending || updateProject.isPending;

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("toasts.nameRequired"));
      return;
    }
    try {
      const data = {
        name,
        address,
        description,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      if (isEditMode && project) {
        await updateProject.mutateAsync(data);
        toast.success(t("toasts.updateSuccess"));
      } else {
        await createProject.mutateAsync(data);
        toast.success(t("toasts.createSuccess"));
      }
      onDone();
    } catch {
      toast.error(isEditMode ? t("toasts.updateError") : t("toasts.createError"));
    }
  };

  return (
    <AddDialogShell
      open
      onOpenChange={() => onDone()}
      titleValue={name}
      onTitleChange={setName}
      titlePlaceholder={t("placeholder.name")}
      descriptionValue={description}
      onDescriptionChange={setDescription}
      descriptionPlaceholder={t("placeholder.description")}
      contextText={isEditMode ? t("context.edit") : t("context.new")}
      submitLabel={isEditMode ? t("submit.saveChanges") : t("submit.create")}
      onSubmit={handleSubmit}
      isSubmitting={isLoading}
      submitDisabled={!name.trim()}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* ===== ADRESA + STAV (vedle sebe) ===== */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="address">{t("label.address")}</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("placeholder.address")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t("label.status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">{tStatuses("planning")}</SelectItem>
                <SelectItem value="active">{tStatuses("active")}</SelectItem>
                <SelectItem value="paused">{tStatuses("paused")}</SelectItem>
                <SelectItem value="completed">{tStatuses("completed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ===== TERMÍNY (volitelné) — MD3 tonal section ===== */}
        <CollapsibleSection title={t("section.dates")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">{t("field.startDate")}</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">{t("field.endDate")}</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </AddDialogShell>
  );
}
