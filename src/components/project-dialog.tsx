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
      toast.error("Název projektu je povinný");
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
        toast.success("Projekt byl upraven");
      } else {
        await createProject.mutateAsync(data);
        toast.success("Projekt byl vytvořen");
      }
      onDone();
    } catch {
      toast.error(isEditMode ? "Nepodařilo se upravit projekt" : "Nepodařilo se vytvořit projekt");
    }
  };

  return (
    <AddDialogShell
      open
      onOpenChange={() => onDone()}
      titleValue={name}
      onTitleChange={setName}
      titlePlaceholder="Název projektu…"
      descriptionValue={description}
      onDescriptionChange={setDescription}
      descriptionPlaceholder="Krátký popis projektu…"
      contextText={isEditMode ? "Úprava projektu" : "Nový projekt"}
      submitLabel={isEditMode ? "Uložit změny" : "Vytvořit projekt"}
      onSubmit={handleSubmit}
      isSubmitting={isLoading}
      submitDisabled={!name.trim()}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* ===== ADRESA + STAV (vedle sebe) ===== */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="address">Adresa</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="např. Praha - Troja"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Stav</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Plánování</SelectItem>
                <SelectItem value="active">Aktivní</SelectItem>
                <SelectItem value="paused">Pozastaveno</SelectItem>
                <SelectItem value="completed">Dokončeno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ===== TERMÍNY (volitelné) — MD3 tonal section ===== */}
        <CollapsibleSection title="Termíny (volitelné)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Datum zahájení</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Datum dokončení</Label>
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
