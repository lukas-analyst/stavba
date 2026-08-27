"use client";

import { Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ProjectDialog } from "@/components/project-dialog";

export function EmptyState() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Home className="h-10 w-10" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Vítejte v aplikaci Stavba</h2>
        <p className="max-w-md text-muted-foreground">
          Vyberte projekt z postranního panelu, nebo vytvořte nový projekt pro
          sledování rozpočtu, nákladů, času a materiálu stavby a rekonstrukce.
        </p>
      </div>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> Vytvořit první projekt
      </Button>
      <ProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
