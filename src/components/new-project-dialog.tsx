"use client";

import { useState, useMemo } from "react";
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
import { useCreateProjectFromTemplate, useProjects } from "@/lib/api";
import { PROJECT_TEMPLATES } from "@/lib/project-templates";
import { toast } from "sonner";
import { Loader2, Building, Home, Palette, Plus, Copy, FileText, ChevronRight } from "lucide-react";
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

type Mode = "blank" | "template" | "copy";

export function NewProjectDialog({ open, onOpenChange }: Props) {
  const createFromTemplate = useCreateProjectFromTemplate();
  const qc = useQueryClient();
  const { data: projects } = useProjects();

  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [scope, setScope] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => PROJECT_TEMPLATES.find((t) => t.type === templateType),
    [templateType],
  );
  const needsScope = selectedTemplate?.askScope;

  const reset = () => {
    setMode(null);
    setName("");
    setAddress("");
    setDescription("");
    setTemplateType("");
    setScope("");
    setStartDate("");
    setEndDate("");
    setCopyFromId("");
    setIsSubmitting(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  // ===== Submit handlers =====

  const handleCreateBlank = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || undefined,
          description: description.trim() || undefined,
          status: "planning",
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create project");
      }
      toast.success("Projekt vytvořen");
      qc.invalidateQueries({ queryKey: ["projects"] });
      reset();
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se vytvořit projekt");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFromTemplate = async () => {
    setIsSubmitting(true);
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
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se vytvořit projekt");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyProject = async () => {
    if (!copyFromId) return;
    setIsSubmitting(true);
    try {
      const source = projects?.find((p) => p.id === copyFromId);
      if (!source) throw new Error("Zdrojový projekt nebyl nalezen");

      // Create new project
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || source.address || undefined,
          description: description.trim() || source.description || undefined,
          status: "planning",
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create project");
      }
      const newProject = await res.json();

      // Copy budget items from source project
      const budgetRes = await fetch(`/api/projects/${copyFromId}/budget`);
      if (budgetRes.ok) {
        const items = await budgetRes.json();
        // Send all items in a single batch (via Promise.all for parallel creation)
        await Promise.all(
          items.map((item: Record<string, unknown>) =>
            fetch(`/api/projects/${newProject.id}/budget`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                category: item.category,
                subcategory: item.subcategory,
                element: item.element,
                phase: item.phase,
                required: item.required,
                completed: false,
                rejected: false,
                note: item.note,
                planCost: item.planCost,
                flexibilityPercent: item.flexibilityPercent,
                planDays: item.planDays,
              }),
            }),
          ),
        );
      }

      toast.success(`Projekt vytvořen (zkopírováno z "${source.name}")`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      reset();
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se zkopírovat projekt");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Název projektu je povinný");
      return;
    }
    if (mode === "blank") handleCreateBlank();
    else if (mode === "template") {
      if (!templateType) {
        toast.error("Vyberte typ stavby");
        return;
      }
      if (needsScope && !scope) {
        toast.error("Vyberte rozsah rekonstrukce");
        return;
      }
      handleCreateFromTemplate();
    } else if (mode === "copy") {
      if (!copyFromId) {
        toast.error("Vyberte zdrojový projekt");
        return;
      }
      handleCopyProject();
    }
  };

  const canSubmit =
    name.trim() &&
    mode !== null &&
    (mode === "blank" ||
      (mode === "template" && templateType && (!needsScope || scope)) ||
      (mode === "copy" && copyFromId)) &&
    !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nový projekt</DialogTitle>
          <DialogDescription>
            Vyberte, jak chcete projekt vytvořit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ===== Mode selection (3 cards) ===== */}
          {!mode && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Blank project */}
              <button
                onClick={() => setMode("blank")}
                className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="text-sm font-semibold">Prázdný projekt</div>
                <p className="text-[11px] text-muted-foreground">
                  Začnete s čistým štítem, rozpočet přidáte později
                </p>
              </button>

              {/* From template */}
              <button
                onClick={() => setMode("template")}
                className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Home className="h-6 w-6 text-primary" />
                </div>
                <div className="text-sm font-semibold">Ze šablony</div>
                <p className="text-[11px] text-muted-foreground">
                  Rekonstrukce, nová stavba, interiér nebo přístavba
                </p>
              </button>

              {/* Copy existing */}
              <button
                onClick={() => setMode("copy")}
                disabled={!projects || projects.length === 0}
                className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Copy className="h-6 w-6 text-primary" />
                </div>
                <div className="text-sm font-semibold">Kopírovat projekt</div>
                <p className="text-[11px] text-muted-foreground">
                  Zkopíruje rozpočet z existujícího projektu
                </p>
              </button>
            </div>
          )}

          {/* ===== Back button + form ===== */}
          {mode && (
            <>
              <button
                onClick={() => setMode(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                ← Zpět na výběr typu
              </button>

              {/* Project name (always visible) */}
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

              {/* ===== Template mode: select template type + scope ===== */}
              {mode === "template" && (
                <div className="space-y-4">
                  <div className="space-y-2">
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
                    <div className="space-y-2">
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

                  {/* Template preview */}
                  {templateType && selectedTemplate && (!needsScope || scope) && (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Náhled položek ({selectedTemplate.items.length})
                        </span>
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

              {/* ===== Copy mode: select source project ===== */}
              {mode === "copy" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Zdrojový projekt *</Label>
                    <Select value={copyFromId} onValueChange={setCopyFromId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Vyberte projekt ke zkopírování…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}{p.address ? ` — ${p.address}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {copyFromId && (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">
                        Zkopírují se všechny položky rozpočtu (kategorie, plány, vůle, fáze).
                        Skutečné hodnoty, hotovo a zavržené stavy se resetují.
                        Platby, časové záznamy a kontakty se nekopírují.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ===== Common fields (address, description, dates) ===== */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <Label htmlFor="proj-start">Datum zahájení</Label>
                  <Input
                    id="proj-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Zrušit
          </Button>
          {mode && (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "blank" && "Vytvořit projekt"}
              {mode === "template" && "Vytvořit se šablonou"}
              {mode === "copy" && "Zkopírovat projekt"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
