"use client";

import { useState, useEffect, useRef } from "react";
import { useProjects, useUpdateProject } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FileText,
  Save,
  Loader2,
  Eye,
  Pencil,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Bold,
  Italic,
  Code,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function NotesTab({ projectId }: { projectId: string }) {
  return <NotesTabInner key={projectId} projectId={projectId} />;
}

function NotesTabInner({ projectId }: { projectId: string }) {
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const updateProject = useUpdateProject(projectId);
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server content from the project; localContent is null until user edits
  const serverContent = project?.notes ?? "";
  const content = localContent ?? serverContent;
  const isDirty = localContent !== null && localContent !== serverContent;

  // Auto-save with debounce (only when content differs from server)
  useEffect(() => {
    if (!project || !isDirty) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await updateProject.mutateAsync({ notes: localContent });
        setSavedAt(new Date());
      } catch {
        toast.error("Nepodařilo se uložit poznámky");
      }
    }, 1500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localContent, isDirty, project, updateProject]);

  const setContent = (val: string) => setLocalContent(val);

  const insertSyntax = (before: string, after: string = "") => {
    const textarea = document.getElementById("notes-textarea") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const newContent =
      content.substring(0, start) + before + selected + after + content.substring(end);
    setContent(newContent);
    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = end + before.length;
    }, 0);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const lineCount = content.split("\n").length;
  const todoCount = (content.match(/^[-*]\s\[\s\]/gm) || []).length;
  const doneCount = (content.match(/^[-*]\s\[x\]/gim) || []).length;

  // Show a skeleton while the projects list is still loading on the very
  // first paint — otherwise the textarea would briefly render empty and
  // flash the placeholder before the server content arrives.
  if (!projects) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
          <button
            onClick={() => setMode("edit")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "edit"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pencil className="h-3.5 w-3.5" /> Upravit
          </button>
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "preview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Náhled
          </button>
        </div>

        {/* Markdown toolbar (edit mode only) */}
        {mode === "edit" && (
          <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
            <button
              onClick={() => insertSyntax("**", "**")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Tučně"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("*", "*")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Kurzíva"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("\n## ", "")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Nadpis"
            >
              <span className="text-xs font-bold">H</span>
            </button>
            <button
              onClick={() => insertSyntax("\n- ", "")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Odrážka"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("\n1. ", "")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Číslovaný seznam"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("\n- [ ] ", "")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Úkol (checkbox)"
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("\n> ", "")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Citace"
            >
              <Quote className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("`", "`")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Kód"
            >
              <Code className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSyntax("[", "](url)")}
              className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Odkaz"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {todoCount > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {doneCount}/{todoCount} úkolů
            </span>
          )}
          <span>{wordCount} slov</span>
          <span>{lineCount} řádků</span>
          {updateProject.isPending ? (
            <span className="flex items-center gap-1 text-amber-600">
              <Loader2 className="h-3 w-3 animate-spin" /> Ukládám…
            </span>
          ) : savedAt ? (
            <span className="text-emerald-600">Uloženo</span>
          ) : null}
        </div>
      </div>

      {/* Editor / Preview */}
      {mode === "edit" ? (
        <Textarea
          id="notes-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Sem si pište poznámky k projektu — rozhodnutí, nápady, úkoly, kontakty, odkazy…

Podporuje Markdown:
## Nadpis
- odrážka
1. číslovaný seznam
- [ ] úkol
**tučně** *kurzíva* `kód`
> citace
[odkaz](https://…)"
          className="min-h-[60vh] resize-y font-mono text-sm leading-relaxed"
        />
      ) : (
        <Card>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            {content.trim() ? (
              <MarkdownPreview content={content} />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Zatím žádné poznámky. Přepněte do režimu „Upravit".
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer hints */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          <span>Poznámky se ukládají automaticky (1.5s po zadání). Podporují Markdown.</span>
        </div>
        <div>
          {charCount} znaků
        </div>
      </div>
    </div>
  );
}

// Minimal markdown renderer (headings, bold, italic, lists, todos, code, quotes, links)
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = (key: string) => {
    if (listBuffer.length > 0) {
      const items = listBuffer;
      listBuffer = [];
      const Tag = listType ?? "ul";
      blocks.push(
        Tag === "ul" ? (
          <ul key={key} className="my-2 ml-5 list-disc space-y-0.5">
            {items}
          </ul>
        ) : (
          <ol key={key} className="my-2 ml-5 list-decimal space-y-0.5">
            {items}
          </ol>
        ),
      );
      listType = null;
    }
  };

  const renderInline = (text: string, keyPrefix: string): React.ReactNode => {
    // Process: bold, italic, code, links
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let idx = 0;
    const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/;
    while (remaining.length > 0) {
      const m = regex.exec(remaining);
      if (!m) {
        parts.push(remaining);
        break;
      }
      if (m.index > 0) parts.push(remaining.substring(0, m.index));
      if (m[2]) {
        parts.push(<strong key={`${keyPrefix}-b-${idx}`}>{m[2]}</strong>);
      } else if (m[3]) {
        parts.push(<em key={`${keyPrefix}-i-${idx}`}>{m[3]}</em>);
      } else if (m[4]) {
        parts.push(
          <code key={`${keyPrefix}-c-${idx}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
            {m[4]}
          </code>,
        );
      } else if (m[5] && m[6]) {
        parts.push(
          <a key={`${keyPrefix}-l-${idx}`} href={m[6]} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
            {m[5]}
          </a>,
        );
      }
      remaining = remaining.substring(m.index + m[0].length);
      idx++;
    }
    return <>{parts}</>;
  };

  lines.forEach((line, i) => {
    const key = `block-${i}`;
    // Heading
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushList(`${key}-flush`);
      const level = h[1].length;
      const sizes = ["text-xl font-bold", "text-lg font-bold", "text-base font-semibold", "text-sm font-semibold"];
      blocks.push(
        <div key={key} className={`mt-3 mb-1 ${sizes[level - 1]}`}>
          {renderInline(h[2], key)}
        </div>,
      );
      return;
    }
    // Todo
    const todo = line.match(/^[-*]\s\[\s([x\s]?)\]\s+(.+)$/i);
    if (todo) {
      listType = "ul";
      const done = todo[1].toLowerCase() === "x";
      listBuffer.push(
        <li key={`${key}-li`} className="list-none">
          <label className="flex items-start gap-2">
            <input type="checkbox" defaultChecked={done} className="mt-0.5" readOnly />
            <span className={done ? "line-through text-muted-foreground" : ""}>
              {renderInline(todo[2], key)}
            </span>
          </label>
        </li>,
      );
      return;
    }
    // Unordered list
    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      listType = "ul";
      listBuffer.push(<li key={`${key}-li`}>{renderInline(ul[1], key)}</li>);
      return;
    }
    // Ordered list
    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      listType = "ol";
      listBuffer.push(<li key={`${key}-li`}>{renderInline(ol[1], key)}</li>);
      return;
    }
    // Quote
    const q = line.match(/^>\s+(.+)$/);
    if (q) {
      flushList(`${key}-flush`);
      blocks.push(
        <blockquote key={key} className="my-2 border-l-4 border-muted-foreground/30 pl-3 italic text-muted-foreground">
          {renderInline(q[1], key)}
        </blockquote>,
      );
      return;
    }
    // Empty line
    if (line.trim() === "") {
      flushList(`${key}-flush`);
      return;
    }
    // Paragraph
    flushList(`${key}-flush`);
    blocks.push(
      <p key={key} className="my-1 leading-relaxed">
        {renderInline(line, key)}
      </p>,
    );
  });
  flushList("final");

  return <div>{blocks}</div>;
}
