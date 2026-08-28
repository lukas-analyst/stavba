"use client";

import { useState } from "react";
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
import { useCreateProjectFromTemplate, useProjects, useCreateBudgetItem } from "@/lib/api";
import { PROJECT_TEMPLATES } from "@/lib/project-templates";
import { toast } from "sonner";
import { Loader2, Building, Home, Palette, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reconstruction: Building,
  new_build: Home,
  interior: Palette,
  extension: Plus,
};

export function NewProjectDialog({ open, onOpenChange }: Props) {
  const createFromTemplate = useCreateProjectFromTemplate();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [scope, setScope] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Copy existing project
  const [copyFromId, setCopyFromId] = useState("");
  const { data: projects } = useProjects();

  const selectedTemplate = PROJECT_TEMPLATES.find((t) => t.type === templateType);
  const needsScope = selectedTemplate?.askScope;

  const reset = () => {
    setStep(1);
    setName("");
    setAddress("");
    setDescription("");
    setTemplateType("");
    setScope("");
    setStartDate("");
    setEndDate("");
    setCopyFromId("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Název projektu je povinný");
      return;
    }

    // Mode 1: Copy existing project
    if (copyFromId) {
      try {
        const source = projects?.find((p) => p.id === copyFromId);
        if (!source) {
          toast.error("Zdrojový projekt nebyl nalezen");
          return;
        }
        // Create new project
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            address: address.trim() || source.address,
            description: description.trim() || source.description,
            status: "planning",
            startDate: startDate || null,
            endDate: endDate || null,
          }),
        });
        if (!res.ok) throw new Error("Failed to create project");
        const newProject = await res.json();

        // Copy budget items
        const budgetRes = await fetch(`/api/projects/${copyFromId}/budget`);
        if (budgetRes.ok) {
          const items = await budgetRes.json();
          for (const item of items) {
            await fetch(`/api/projects/${newProject.id}/budget`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                category: item.category,
                subcategory: item.subcategory,
                element: item.element,
                phase: item.phase,
                required: item.required,
                completed: false,
                note: item.note,
                planCost: item.planCost,
                flexibilityPercent: item.flexibilityPercent,
                planDays: item.planDays,
              }),
            });
          }
        }

        toast.success(`Projekt vytvořen (zkopírováno ${source.name})`);
        qc.invalidateQueries({ queryKey: ["projects"] });
        reset();
        onOpenChange(false);
      } catch {
        toast.error("Nepodařilo se zkopírovat projekt");
      }
      return;
    }

    // Mode 2: From template
    if (!templateType) {
      toast.error("Vyberte typ stavby");
      return;
    }
    if (needsScope && !scope) {
      toast.error("Vyberte rozsah rekonstrukce");
      return;
    }

    try {
      await createFromTemplate.mutateAsync({
        name: name.trim(),
        address: address.trim() || undefined,
        description: description.trim() || undefined,
        templateType,
        scope: scope || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      toast.success("Projekt vytvořen se šablonou položek");
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Nepodařilo se vytvořit projekt");
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nový projekt</DialogTitle>
          <DialogDescription>
            Vytvořte nový projekt ze šablony nebo zkopírujte existující.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Choose mode */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Project name */}
            <div className="space-y-2">
              <Label htmlFor="proj-name">Název projektu *</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Troja, Chalupa, Byt v Praze"
                autoFocus
              />
            </div>

            {/* Mode selection */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* From template */}
              <button
                onClick={() => setStep(2)}
                className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <Home className="h-6 w-6 text-primary" />
                <div>
                  <div className="text-sm font-semibold">Ze šablony</div>
                  <p className="text-xs text-muted-foreground">
                    Nová stavba, rekonstrukce, interiér nebo přístavba s předvyplněnými položkami
                  </p>
                </div>
              </button>

              {/* Copy existing */}
              <div
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border p-4",
                  projects && projects.length > 0 ? "cursor-pointer hover:bg-muted/50" : "opacity-50",
                )}
                onClick={() => projects && projects.length > 0 && setStep(2)}
              >
                <Plus className="h-6 w-6 text-primary" />
                <div>
                  <div className="text-sm font-semibold">Kopírovat existující</div>
                  <p className="text-xs text-muted-foreground">
                    {projects && projects.length > 0
                      ? "Zkopíruje položky rozpočtu z jiného projektu"
                      : "Zatím nemáte žádné projekty ke kopírování"}
                  </p>
                </div>
              </div>
            </div>

            {/* Common fields */}
            <div className="space-y-2">
              <Label htmlFor="proj-address">Adresa</Label>
              <Input
                id="proj-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="např. Praha - Troja"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Popis</Label>
              <Textarea
                id="proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Krátký popis projektu…"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="proj-start">Datum zahájení</Label>
                <Input
                  id="proj-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-end">Datum dokončení</Label>
                <Input
                  id="proj-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Template selection or copy source */}
        {step === 2 && (
          <div className="space-y-4">
            <button
              onClick={() => setStep(1)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Zpět
            </button>

            {/* Template selection */}
            <div className="space-y-3">
              <Label>Typ stavby</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROJECT_TEMPLATES.map((tpl) => {
                  const Icon = TEMPLATE_ICONS[tpl.type] ?? Building;
                  return (
                    <button
                      key={tpl.type}
                      onClick={() => {
                        setTemplateType(tpl.type);
                        setScope("");
                      }}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        templateType === tpl.type
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{tpl.label}</div>
                        <p className="text-[11px] text-muted-foreground">{tpl.description}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {tpl.items.length} položek ·{" "}
                          {tpl.items.reduce((s, i) => s + (i.planCost || 0), 0).toLocaleString("cs-CZ")} Kč plán
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scope selection (for reconstruction) */}
            {needsScope && templateType && (
              <div className="space-y-3">
                <Label>Rozsah rekonstrukce</Label>
                <div className="grid grid-cols-1 gap-2">
                  {selectedTemplate?.scopeOptions?.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setScope(opt.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        scope === opt.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{opt.label}</div>
                        <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Copy existing project */}
            {projects && projects.length > 0 && (
              <div className="space-y-3">
                <Label>Nebo zkopírovat z existujícího projektu</Label>
                <Select value={copyFromId} onValueChange={(v) => { setCopyFromId(v); setTemplateType(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte zdrojový projekt…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.address ? ` — ${p.address}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {copyFromId && (
                  <p className="text-[11px] text-muted-foreground">
                    Zkopírují se všechny položky rozpočtu (kategorie, plány, vůle, fáze). Skutečné hodnoty a hotovo se resetují.
                  </p>
                )}
              </div>
            )}

            {/* Template preview */}
            {templateType && selectedTemplate && !copyFromId && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Náhled položek ({selectedTemplate.items.length})
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto scrollbar-thin">
                  {selectedTemplate.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="truncate font-medium">{item.subcategory}</span>
                      <span className="text-muted-foreground">— {item.phase}</span>
                      {item.planCost && (
                        <span className="ml-auto font-medium tabular-nums">
                          {item.planCost.toLocaleString("cs-CZ")} Kč
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Zrušit
          </Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!name.trim()}>
              Pokračovat
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={
                !name.trim() ||
                (!templateType && !copyFromId) ||
                (needsScope && !scope && !copyFromId) ||
                createFromTemplate.isPending
              }
            >
              {createFromTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {copyFromId ? "Zkopírovat projekt" : "Vytvořit se šablonou"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
