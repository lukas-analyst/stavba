"use client";

import { useState } from "react";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { MessageSquare, Trash2, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommentSection({ budgetItemId }: { budgetItemId: string }) {
  const { data: comments, isLoading } = useComments(budgetItemId);
  const createComment = useCreateComment(budgetItemId);
  const deleteComment = useDeleteComment(budgetItemId);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await createComment.mutateAsync({
        author: author.trim() || "Anonym",
        text: text.trim(),
      });
      setText("");
    } catch {
      /* handled by mutation */
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Komentáře ({comments?.length ?? 0})
        </span>
      </div>

      {/* Comments list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="scrollbar-none max-h-48 space-y-2 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div
              key={c.id}
              className="group rounded-md border bg-background p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{c.author}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </span>
                  <button
                    onClick={() => deleteComment.mutate(c.id)}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    aria-label="Smazat komentář"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <p className="mt-0.5 text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-3 text-center text-[11px] text-muted-foreground">
          Zatím žádné komentáře. Přidejte poznámku nebo dotaz.
        </p>
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Jméno (volitelné)"
            className="h-7 w-32 text-xs"
          />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Napište komentář…"
            className="h-7 flex-1 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            variant="default"
            className="h-7 shrink-0 px-2"
            disabled={!text.trim() || createComment.isPending}
          >
            {createComment.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
