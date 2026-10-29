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
import { EmptyStateBox } from "@/components/empty-state-box";
import { useAnalytics } from "@/hooks/use-analytics";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("tabs.notes");
  const tc = useTranslations("common");
  const { data: notes, isLoading } = useNotes(projectId);
  const createNote = useCreateNote(projectId);
  const deleteNote = useDeleteNote(projectId);
  const updateNote = useUpdateNote(projectId);
  const { trackEvent } = useAnalytics(projectId);

  // Author is remembered in localStorage so the user doesn't have to retype
  // their name on every visit / every project.
  const [author, setAuthor] = useState<string>(readSavedAuthor);
  const [text, setText] = useState<string>("");

  // Track which note is currently being deleted / saved so we only show
  // the spinner on that one card (instead of on every card simultaneously).
  // Reset back to null once the mutation settles.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);

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
      const authorName = author.trim() || t("anonymousAuthor");
      await createNote.mutateAsync({
        author: authorName,
        text: text.trim(),
      });
      trackEvent("add_note", { author: authorName });
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.createError"));
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
    try {
      await deleteNote.mutateAsync(id);
      toast.success(t("toasts.deleteSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleUpdate = async (id: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) {
      toast.error(t("toasts.updateEmptyError"));
      return false;
    }
    setPendingSaveId(id);
    try {
      const note = notes?.find((n) => n.id === id);
      await updateNote.mutateAsync({ id, text: trimmed });
      trackEvent("edit_note", { author: note?.author ?? t("anonymousAuthor") });
      toast.success(t("toasts.updateSuccess"));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.updateError"));
      return false;
    } finally {
      setPendingSaveId(null);
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
    <div id="notes-root" className="space-y-4">
      {/* Add note form */}
      <form
        id="notes-add-form"
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="type-title">{t("title.new")}</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1">
            <label htmlFor="note-author" className="type-label text-on-surface-variant">
              {t("field.author")}
            </label>
            <Input
              id="note-author"
              value={author}
              onChange={(e) => persistAuthor(e.target.value)}
              placeholder={t("placeholder.author")}
              className="h-9 type-body"
              maxLength={100}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="note-text" className="type-label text-on-surface-variant">
              {t("field.text")}
            </label>
            <Textarea
              id="note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleTextKeyDown}
              placeholder={t("placeholder.text")}
              rows={3}
              className="resize-y type-body"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="type-label text-on-surface-variant">
            {t("count", { count: notes?.length ?? 0 })}
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
            {tc("add")}
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
              isDeleting={deleteNote.isPending && pendingDeleteId === n.id}
              onSave={handleUpdate}
              isSaving={updateNote.isPending && pendingSaveId === n.id}
            />
          ))}
        </div>
      ) : (
        <EmptyStateBox
          icon={StickyNote}
          title={t("empty.title")}
          description={t("empty.description")}
        />
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
  const t = useTranslations("tabs.notes");
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
    // Skip the API call entirely if the user didn't actually change the
    // text — avoids redundant saves (e.g. when clicking "Uložit" without
    // editing, or when onBlur fires after the same commit).
    if (draft === note.text) {
      setIsEditing(false);
      return;
    }
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
    <div className="group relative rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md hover-lift">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-secondary-container type-label-sm font-semibold text-secondary-container-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 type-title">
              <User className="h-3 w-3 text-on-surface-variant" />
              {note.author}
            </span>
            <Badge variant="secondary" className="type-label-sm font-normal">
              {formatDate(note.createdAt, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Badge>
            {isEditing && (
              <Badge variant="outline" className="type-label-sm font-normal text-info-strong">
                {t("badge.editing")}
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
                className="resize-y type-body leading-relaxed"
                disabled={isSaving}
                maxLength={5000}
              />
              <div className="flex items-center gap-1.5 type-label-sm text-on-surface-variant">
                <span>{t("hint.editShortcuts")}</span>
              </div>
            </div>
          ) : (
            <p
              className="mt-1.5 cursor-text whitespace-pre-wrap break-words type-body leading-relaxed text-foreground/90"
              onClick={startEdit}
              title={t("clickToEdit")}
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
                "h-7 w-7 text-on-surface-variant opacity-0 transition-opacity hover:bg-surface-container-high hover:text-info-strong group-hover:opacity-100",
              )}
              onClick={startEdit}
              aria-label={t("aria.edit")}
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
                className="h-7 w-7 text-success hover:bg-surface-container-high hover:text-success-strong"
                // preventDefault on mouseDown keeps focus in the textarea
                // so onBlur doesn't fire BEFORE the click handler —
                // otherwise clicking "Save" would trigger commitEdit twice
                // (once via blur, once via click) and "Cancel" would save
                // instead of discarding.
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitEdit}
                aria-label={t("aria.save")}
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
                className="h-7 w-7 text-on-surface-variant hover:bg-surface-container-high hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelEdit}
                aria-label={t("aria.cancel")}
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
                "h-7 w-7 text-on-surface-variant opacity-0 transition-opacity hover:bg-surface-container-high hover:text-destructive group-hover:opacity-100",
                isDeleting && "opacity-100",
              )}
              onClick={onDelete}
              aria-label={t("aria.delete")}
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
