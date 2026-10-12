"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatNumber, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ============================================================
// InlineNumber — click-to-edit numeric value (MD3 DataTable pattern)
// ------------------------------------------------------------
// Used in Budget (Plán, Skut., Dny), Payments (Částka), Time (Hodiny).
// Shows the value as a button; clicking switches to an <input>.
// Enter or blur commits; Escape cancels. Empty → null.
// ============================================================

export function InlineNumber({
  value,
  onCommit,
  suffix,
  className,
  align = "right",
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  suffix?: string;
  className?: string;
  align?: "left" | "right";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = draft.trim() === "" ? null : Number(draft.replace(",", "."));
          if (n !== value && (n === null || !isNaN(n))) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value?.toString() ?? "");
            setEditing(false);
          }
        }}
        className={cn("h-7 w-20 type-body", align === "right" && "text-right", className)}
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value?.toString() ?? "");
        setEditing(true);
      }}
      className={cn(
        "block w-full rounded px-1 py-0.5 type-body hover:bg-surface-container-high",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {value === null || value === undefined ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span className="tabular-nums">{formatNumber(value, suffix ?? "")}</span>
      )}
    </button>
  );
}

// ============================================================
// InlineDate — click-to-edit date value
// ------------------------------------------------------------
// Used in Budget (Datum od/do), Payments (Datum), Time (Datum).
// Shows formatted date as button; clicking opens <input type="date">.
// ============================================================

export function InlineDate({
  value,
  onCommit,
  align = "left",
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  align?: "left" | "right";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? value.substring(0, 10) : "");

  if (editing) {
    return (
      <Input
        type="date"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== (value ? value.substring(0, 10) : "")) {
            onCommit(draft || null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value ? value.substring(0, 10) : "");
            setEditing(false);
          }
        }}
        className="h-7 w-36 type-body"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value ? value.substring(0, 10) : "");
        setEditing(true);
      }}
      className={cn(
        "block w-full rounded px-1 py-0.5 type-body hover:bg-surface-container-high",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {value ? (
        <span>{formatDate(value)}</span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}
    </button>
  );
}
