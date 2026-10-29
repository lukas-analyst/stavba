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
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  placeholder?: string;
}) {
  return (
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
      placeholder={placeholder}
      rows={3}
      className="type-label"
    />
  );
}
