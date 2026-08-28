"use client";

import { useState, useRef, useEffect } from "react";
import {
  useNotes,
  useCreateNote,
  useDeleteNote,
  useUpdateNote,
  type Note,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  StickyNote,
  Plus,
  Trash2,
  Loader2,
  User,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// localStorage key for remembering the user's chosen author name across
// sessions and across projects.
const AUTHOR_LS_KEY = "stavba.notes.author";

// Read the remembered author once at module init. We don't use a
// `useEffect` + `setState` pattern here because that triggers cascading
// renders (and ESLint flags it). Reading during the lazy initializer of
// `useState` runs only on the very first render of this component and
// never again, which is exactly what we want.
function readSavedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_LS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function NotesTab({ projectId }: { projectId: string }) {
  const { data: notes, isLoading } = useNotes(projectId);
  const createNote = useCreateNote(projectId);
  const deleteNote = useDeleteNote(projectId);
  const updateNote = useUpdateNote(projectId);

  // Author is remembered in localStorage so the user doesn't have to retype
  // their name on every visit / every project.
  const [author, setAuthor] = useState<string>(readSavedAuthor);
  const [text, setText] = useState<string>("");

  const persistAuthor = (value: string) => {
    setAuthor(value);
    try {
      if (value.trim()) {
        localStorage.setItem(AUTHOR_LS_KEY, value.trim());
      } else {
        localStorage.removeItem(AUTHOR_LS_KEY);
      }
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    try {
      await createNote.mutateAsync({
        author: author.trim() || "Anonym",
        text: text.trim(),
      });
      setText("");
    } catch {
      toast.error("Nepodařilo se přidat poznámku");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNote.mutateAsync(id);
      toast.success("Poznámka smazána");
    } catch {
      toast.error("Nepodařilo se smazat poznámku");
    }
  };

  const handleUpdate = async (id: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) {
      toast.error("Text poznámky nemůže být prázdný");
      return false;
    }
    try {
      await updateNote.mutateAsync({ id, text: trimmed });
      toast.success("Poznámka upravena");
      return true;
    } catch {
      toast.error("Nepodařilo se upravit poznámku");
      return false;
    }
  };

  // Ctrl/Cmd+Enter in the textarea submits the note.
  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Nová poznámka</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1">
            <label htmlFor="note-author" className="text-xs font-medium text-muted-foreground">
              Jméno autora
            </label>
            <Input
              id="note-author"
              value={author}
              onChange={(e) => persistAuthor(e.target.value)}
              placeholder="např. Pavel"
              className="h-9 text-sm"
              maxLength={100}
            />
            <p className="text-[10px] text-muted-foreground">
              Jméno si pamatujeme pro příště.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="note-text" className="text-xs font-medium text-muted-foreground">
              Text poznámky
            </label>
            <Textarea
              id="note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleTextKeyDown}
              placeholder="Sem napište poznámku k projektu — rozhodnutí, nápad, úkol, zprávu… (Ctrl+Enter = přidat)"
              rows={3}
              className="resize-y text-sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {notes?.length ?? 0} {notes?.length === 1 ? "poznámka" : (notes?.length ?? 0) >= 2 && (notes?.length ?? 0) <= 4 ? "poznámky" : "poznámek"}
          </p>
          <Button
            type="submit"
            size="sm"
            disabled={!text.trim() || createNote.isPending}
          >
            {createNote.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Přidat
          </Button>
        </div>
      </form>

      {/* Notes list (newest first) */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              onDelete={() => handleDelete(n.id)}
              isDeleting={deleteNote.isPending}
              onSave={handleUpdate}
              isSaving={updateNote.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <StickyNote className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Zatím žádné poznámky. Napište první poznámku výše.
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onDelete,
  onSave,
  isDeleting,
  isSaving,
}: {
  note: Note;
  onDelete: () => void;
  onSave: (id: string, newText: string) => Promise<boolean>;
  isDeleting: boolean;
  isSaving: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  // The draft is only used while editing. When not editing we render
  // `note.text` directly, so we never need to keep the draft in sync with
  // server updates (which would require a setState-in-effect anti-pattern).
  const [draft, setDraft] = useState(note.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus + select text when entering edit mode.
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isEditing]);

  const startEdit = () => {
    // Reset the draft from the current note text each time we enter edit
    // mode, so we always start from the latest server state.
    setDraft(note.text);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(note.text);
    setIsEditing(false);
  };

  const commitEdit = async () => {
    const ok = await onSave(note.id, draft);
    if (ok) setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter (without Shift) saves the edit. Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void commitEdit();
    }
    // Escape cancels the edit and restores the original text.
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Build a 2-letter fallback for the avatar from the author's name.
  const initials = note.author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div className="group relative rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-semibold">
              <User className="h-3 w-3 text-muted-foreground" />
              {note.author}
            </span>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {formatDate(note.createdAt, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Badge>
            {isEditing && (
              <Badge variant="outline" className="text-[10px] font-normal text-sky-700">
                úprava
              </Badge>
            )}
          </div>

          {isEditing ? (
            <div className="mt-1.5 space-y-1.5">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitEdit}
                rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
                className="resize-y text-sm leading-relaxed"
                disabled={isSaving}
                maxLength={5000}
              />
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Enter = uložit · Shift+Enter = nový řádek · Esc = zrušit</span>
              </div>
            </div>
          ) : (
            <p
              className="mt-1.5 cursor-text whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90"
              onClick={startEdit}
              title="Klikněte pro úpravu"
            >
              {note.text}
            </p>
          )}
        </div>

        {/* Action buttons: edit + delete. Both visible on hover. */}
        <div className="flex shrink-0 items-center gap-0.5">
          {!isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:bg-sky-50 hover:text-sky-700 group-hover:opacity-100",
              )}
              onClick={startEdit}
              aria-label="Upravit poznámku"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                onClick={commitEdit}
                aria-label="Uložit úpravy"
                disabled={isSaving || !draft.trim()}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={cancelEdit}
                aria-label="Zrušit úpravy"
                disabled={isSaving}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100",
                isDeleting && "opacity-100",
              )}
              onClick={onDelete}
              aria-label="Smazat poznámku"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
