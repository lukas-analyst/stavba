"use client";

import { Textarea } from "@/components/ui/textarea";

// InlineTextarea — uncontrolled Textarea that commits on blur (or Ctrl+Enter).
// Used only in the budget detail panel's note field. The `key` prop on the
// underlying Textarea forces a remount when the value prop changes so the
// uncontrolled `defaultValue` picks up the new content from server state.
//
// `onCommit` fires with the trimmed value (or null when emptied). The
// caller is expected to skip the network call when the value hasn't
// actually changed (BudgetRow already does this).
export function InlineTextarea({
  value,
  onCommit,
  placeholder,
  maxLength = 500,
  maxRows = 5,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  placeholder?: string;
  maxLength?: number;
  maxRows?: number;
}) {
  const charCount = (value ?? "").length;

  return (
    <div className="space-y-1">
      <Textarea
        key={value ?? "__empty__"}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const trimmed = e.target.value.trim() === "" ? null : e.target.value.trim();
          if (trimmed !== (value ?? null)) {
            onCommit(trimmed);
          }
        }}
        onKeyDown={(e) => {
          const target = e.target as HTMLTextAreaElement;
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            target.blur();
          }
          if (e.key === "Escape") {
            target.value = value ?? "";
            target.blur();
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, maxRows * 24)}px`;
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        className="type-body resize-none overflow-y-auto scrollbar-thin"
        style={{
          maxHeight: `${maxRows * 1.5}rem`,
        }}
      />
      {maxLength > 0 && (
        <div className="type-label-sm text-muted-foreground/50 text-right tabular-nums">
          {charCount}/{maxLength}
        </div>
      )}
    </div>
  );
}
