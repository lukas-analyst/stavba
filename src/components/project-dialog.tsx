"use client";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProject, type Project } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
};

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && <ProjectForm key={project?.id ?? "new"} project={project} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
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
  const [name, setName] = useState(project?.name ?? "");
  const [address, setAddress] = useState(project?.address ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState(project?.status ?? "planning");
  const [constructionType, setConstructionType] = useState("reconstruction");
  const [startDate, setStartDate] = useState(
    project?.startDate ? project.startDate.substring(0, 10) : "",
  );
  const [endDate, setEndDate] = useState(
    project?.endDate ? project.endDate.substring(0, 10) : "",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Název projektu je povinný");
      return;
    }
    try {
      await createProject.mutateAsync({
        name,
        address,
        description,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      toast.success("Projekt byl vytvořen");
      onDone();
    } catch {
      toast.error("Nepodařilo se vytvořit projekt");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {project ? "Upravit projekt" : "Nový projekt"}
        </DialogTitle>
        <DialogDescription>
          Vytvořte nový projekt pro stavbu nebo rekonstrukci domu, bytu, chalupy.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Název projektu *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="např. Troja, Chalupa, Byt v Praze"
            required
          />
        </div>
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
          <Label htmlFor="description">Popis</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Krátký popis projektu…"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <div className="space-y-2">
            <Label htmlFor="type">Typ stavby</Label>
            <Select value={constructionType} onValueChange={setConstructionType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reconstruction">Rekonstrukce</SelectItem>
                <SelectItem value="new_build">Nová stavba</SelectItem>
                <SelectItem value="extension">Přístavba</SelectItem>
                <SelectItem value="interior">Interiér</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Zrušit
          </Button>
          <Button type="submit" disabled={createProject.isPending}>
            {createProject.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {project ? "Uložit změny" : "Vytvořit projekt"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
