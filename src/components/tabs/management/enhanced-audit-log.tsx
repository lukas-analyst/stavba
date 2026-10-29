"use client";

// ============================================================
// EnhancedAuditLog — server-side pagination + live polling
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx`. Behavior is unchanged.
//
// - Fetches ONLY the current page from API:
//   GET /api/projects/[id]/audit?action=&entity=&page=&pageSize=&sort=
// - Response shape: { entries, total, page, pageSize, totalPages }
// - Real-time polling every 5s while section is expanded
//   (controlled by `isExpanded` state, toggled via Live button).
// - Filters / sort / page-size / page changes trigger API refetch.
// - Export CSV button → /api/projects/[id]/audit/export (new tab).
// - entityLabel (human-readable name) shown alongside the
//   entityType translation.
// ============================================================

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { getFieldValue } from "@/lib/audit-fields";
import { cn } from "@/lib/utils";
import { useAppStore, type TabId } from "@/lib/store";
import { useTranslations } from "next-intl";
import type { AuditEntry, DescribeHelpers } from "./types";

// Action labels are now looked up via `t("auditLog.actions." + action)`.
const ACTION_LABELS: Record<string, true> = {
  create: true,
  update: true,
  delete: true,
  export: true,
};

// MD3 soft color tokens per action — `bg-*-soft text-*-strong` ensures the
// audit-log action badge stays consistent with other MD3 badges (energy
// rating, invitation status) across the codebase.
const ACTION_COLORS: Record<string, string> = {
  create: "bg-success-soft text-success-strong",
  update: "bg-info-soft text-info-strong",
  delete: "bg-danger-soft text-danger-strong",
  export: "bg-info-soft text-info-strong",
};

// Entity labels are now looked up via `t("auditLog.entities." + entityType)`.
const ENTITY_LABELS: Record<string, true> = {
  BudgetItem: true,
  Payment: true,
  TimeEntry: true,
  Contact: true,
  Project: true,
  Note: true,
  ContactPerson: true,
  ProjectMember: true,
  Export: true,
};

// Human-readable field labels are now looked up via
// `t("auditLog.fields." + field)` at render time. This const is kept as a
// known-field set so callers can fall back gracefully when a field is
// missing from the message bundle (e.g. legacy DB fields).
const FIELD_LABELS_UI: Record<string, true> = {
  required: true,
  completed: true,
  rejected: true,
  starred: true,
  status: true,
  role: true,
  phase: true,
  category: true,
  subcategory: true,
  planCost: true,
  actualCost: true,
  planDays: true,
  flexibilityPercent: true,
  dateFrom: true,
  dateTo: true,
  note: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  description: true,
  currency: true,
  ownerId: true,
  contactId: true,
  workerName: true,
  workerType: true,
  workerCount: true,
  hours: true,
  amount: true,
  type: true,
  vendor: true,
  invoiceNumber: true,
  vatRate: true,
  vatAmount: true,
  website: true,
  company: true,
  ico: true,
  dic: true,
  rating: true,
  sortOrder: true,
  text: true,
  author: true,
  userEmail: true,
};

// C6: Map audit entity types → app tab IDs (for deep-link navigation
// when the user clicks on an entity label in the audit table).
const ENTITY_TAB_MAP: Record<string, TabId> = {
  BudgetItem: "budget",
  Payment: "payments",
  TimeEntry: "time",
  Contact: "contacts",
  Note: "notes",
};

// Generate a human-readable description of what happened.
// `helpers` provides locale-aware lookups: the audit-log translator (scoped
// to `tabs.management.auditLog.describe`), the role translator (scoped to
// `roles`), plus helpers that translate field/entity labels (with a
// graceful fallback to the raw key if not in the message bundle).
export function describeChange(
  entry: AuditEntry,
  helpers: DescribeHelpers,
): string {
  const entityLabel = entry.entityLabel || helpers.entityLabel(entry.entityType);

  // Create — newValue contains a summary string like "Přidán člen (Čtenář): email@..."
  // But older entries may have raw JSON — try to parse and extract readable info
  if (entry.action === "create" && entry.newValue) {
    // Check if it's a human-readable summary (starts with known prefix)
    if (
      entry.newValue.startsWith("Přidán") ||
      entry.newValue.startsWith("Vytvořen") ||
      entry.newValue.startsWith("Odebrán") ||
      entry.newValue.startsWith("Smazán")
    ) {
      return entry.newValue.length < 200 ? entry.newValue : entityLabel;
    }
    // Try parsing as JSON (older format)
    try {
      const parsed = JSON.parse(entry.newValue);
      if (typeof parsed === "object" && parsed !== null) {
        // Extract key info for create entries
        const email = parsed.userEmail ?? parsed.email;
        const role = parsed.role;
        const name = parsed.name ?? parsed.subcategory ?? parsed.workerName ?? parsed.author;
        if (email && role) {
          const roleKey = ["owner", "editor", "viewer", "admin"].includes(role) ? role : "viewer";
          const roleLabel = helpers.tRoles(roleKey);
          return helpers.tDescribe("memberAdded", { role: roleLabel, email });
        }
        if (name) return helpers.tDescribe("created", { name });
        // Generic: show first 3 fields
        const keys = Object.keys(parsed).filter((k) => k !== "userId" && k !== "id").slice(0, 3);
        return keys.map((k) => `${k}: ${parsed[k]}`).join(", ") || entityLabel;
      }
    } catch {
      // Not JSON, use as-is
    }
    return entry.newValue.length < 200 ? entry.newValue : entityLabel;
  }

  // Delete — oldValue contains a summary string like "Odebrán člen (Editor): email@..."
  if (entry.action === "delete" && entry.oldValue) {
    if (
      entry.oldValue.startsWith("Přidán") ||
      entry.oldValue.startsWith("Vytvořen") ||
      entry.oldValue.startsWith("Odebrán") ||
      entry.oldValue.startsWith("Smazán")
    ) {
      return entry.oldValue.length < 200 ? entry.oldValue : entityLabel;
    }
    // Try parsing as JSON (older format)
    try {
      const parsed = JSON.parse(entry.oldValue);
      if (typeof parsed === "object" && parsed !== null) {
        const email = parsed.userEmail ?? parsed.email;
        const role = parsed.role;
        if (email && role) {
          const roleKey = ["owner", "editor", "viewer", "admin"].includes(role) ? role : "viewer";
          const roleLabel = helpers.tRoles(roleKey);
          return helpers.tDescribe("memberRemoved", { role: roleLabel, email });
        }
        const name = parsed.name ?? parsed.subcategory ?? parsed.workerName ?? parsed.author;
        if (name) return helpers.tDescribe("deleted", { name });
      }
    } catch {
      // Not JSON
    }
    return entry.oldValue.length < 200 ? entry.oldValue : entityLabel;
  }

  // Update — field-level change
  if (entry.action === "update" && entry.field) {
    const fieldLabel = helpers.fieldLabel(entry.field);
    // B28: DB stores raw values; translate to human-readable here.
    if (entry.oldValue && entry.newValue) {
      return `${fieldLabel}: ${getFieldValue(entry.field, entry.oldValue)} → ${getFieldValue(entry.field, entry.newValue)}`;
    }
    // userEmail field — show as "E-mail člena: xxx@..." (newValue only, no oldValue)
    if (entry.field === "userEmail" && entry.newValue) {
      return `${fieldLabel}: ${entry.newValue}`;
    }
    if (entry.newValue) {
      return `${fieldLabel}: ${getFieldValue(entry.field, entry.newValue)}`;
    }
    if (entry.oldValue) {
      return helpers.tDescribe("fieldRemoved", {
        field: fieldLabel,
        value: getFieldValue(entry.field, entry.oldValue),
      });
    }
  }

  return entityLabel;
}

export function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: "" };
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return {
    date: `${day}.${month}.${d.getFullYear()}`,
    time: `${hours}:${minutes}`,
  };
}

export type EnhancedAuditLogProps = {
  projectId: string;
};

export function EnhancedAuditLog({ projectId }: EnhancedAuditLogProps) {
  // C6: deep-link to other tabs
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const t = useTranslations("tabs.management.auditLog");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");
  // Helpers for describeChange + diff-viewer render — pass through the
  // translator (scoped to `tabs.management.auditLog`) so labels are
  // looked up from the message bundle. Falls back to the raw key when
  // the entity/action/field isn't in the bundle (e.g. legacy DB rows).
  const entityLabel = (entityType: string): string => {
    if (ENTITY_LABELS[entityType]) return t(`entities.${entityType}`);
    return entityType;
  };
  const actionLabel = (action: string): string => {
    if (ACTION_LABELS[action]) return t(`actions.${action}`);
    return action;
  };
  const fieldLabel = (field: string): string => {
    if (FIELD_LABELS_UI[field]) return t(`fields.${field}`);
    return field;
  };
  const describeHelpers: DescribeHelpers = {
    tDescribe: (key: string, params?: Record<string, string | number>) =>
      t(`describe.${key}`, params),
    tRoles,
    fieldLabel,
    entityLabel,
  };
  // Server-side pagination state
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  // Loading / polling states
  // `loading` is DERIVED from comparing the current filter/page key
  // against the last successfully fetched key. This avoids calling
  // setLoading(true) synchronously inside the effect body (which
  // trips the react-hooks/set-state-in-effect rule and causes
  // cascading renders). The skeleton shows whenever the current
  // filter/page state hasn't been fetched yet.
  const [loadedKey, setLoadedKey] = useState<string>("");
  const [polling, setPolling] = useState(false);
  // Filters / sort
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("desc");
  // B1: full-text search (raw input + debounced query)
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // B2: date range
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  // B7: users that have audit entries (populated from API response)
  const [users, setUsers] = useState<
    Array<{ id: string; name: string | null; email: string; image: string | null }>
  >([]);

  // Derive loading from the current vs. last-fetched filter/page key.
  const currentKey = `${projectId}|${actionFilter}|${entityFilter}|${userFilter}|${searchQuery}|${fromDate}|${toDate}|${page}|${pageSize}|${sortBy}`;
  const loading = loadedKey !== currentKey;

  // B1: Debounced search input — 300ms after the last keystroke,
  // commits the value to `searchQuery` (which is part of the fetch
  // dependency) and resets the page to 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Main fetch — runs on mount and whenever filters/page/sort change.
  // The skeleton shows while `loading` is true (i.e. until the first
  // fetch for the current key completes).
  useEffect(() => {
    let cancelled = false;
    const fetchKey = currentKey;
    const params = new URLSearchParams();
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (entityFilter !== "all") params.set("entity", entityFilter);
    if (userFilter !== "all") params.set("userId", userFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sort", sortBy);
    fetch(`/api/projects/${projectId}/audit?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.entries)) {
          setEntries(data.entries as AuditEntry[]);
          setTotal(typeof data.total === "number" ? data.total : 0);
          setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
          if (Array.isArray(data.users)) setUsers(data.users);
        } else {
          setEntries([]);
          setTotal(0);
          setTotalPages(1);
        }
        setLoadedKey(fetchKey);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
        setLoadedKey(fetchKey);
      });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    page,
    pageSize,
    actionFilter,
    entityFilter,
    userFilter,
    searchQuery,
    fromDate,
    toDate,
    sortBy,
    currentKey,
  ]);

  // Real-time polling — every 5s, always active (no toggle).
  // Uses a subtle "Načítání..." indicator (does not flip the skeleton).
  useEffect(() => {
    const fetchAudit = () => {
      setPolling(true);
      const params = new URLSearchParams();
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (entityFilter !== "all") params.set("entity", entityFilter);
      if (userFilter !== "all") params.set("userId", userFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sort", sortBy);
      fetch(`/api/projects/${projectId}/audit?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.entries)) {
            setEntries(data.entries as AuditEntry[]);
            setTotal(typeof data.total === "number" ? data.total : 0);
            setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
            if (Array.isArray(data.users)) setUsers(data.users);
          }
          setPolling(false);
        })
        .catch(() => setPolling(false));
    };
    const interval = setInterval(fetchAudit, 5000);
    return () => clearInterval(interval);
  }, [
    page,
    pageSize,
    actionFilter,
    entityFilter,
    userFilter,
    searchQuery,
    fromDate,
    toDate,
    sortBy,
    projectId,
  ]);

  // Reset page to 1 when filters/sort/page-size change — done via
  // wrapper handlers to avoid setState-in-effect lint error.
  const handleActionFilterChange = (v: string) => {
    setActionFilter(v);
    setPage(1);
  };
  const handleEntityFilterChange = (v: string) => {
    setEntityFilter(v);
    setPage(1);
  };
  const handleUserFilterChange = (v: string) => {
    setUserFilter(v);
    setPage(1);
  };
  const handleSortChange = (v: string) => {
    setSortBy(v);
    setPage(1);
  };
  const handlePageSizeChange = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };
  const handleFromDateChange = (v: string) => {
    setFromDate(v);
    setPage(1);
  };
  const handleToDateChange = (v: string) => {
    setToDate(v);
    setPage(1);
  };
  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* ===== Filter section — grouped card ===== */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-3">
      {/* Row 1: Polling indicator + search input */}
      <div className="flex flex-wrap items-center gap-2">
        {polling && (
          <span className="flex items-center gap-1 type-label text-on-surface-variant">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("polling")}
          </span>
        )}
        {/* B1: Full-text search input with debounce (300ms) */}
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant/50" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("search.placeholder")}
            className="h-9 rounded-md pl-8 pr-8 type-label"
            aria-label={t("search.aria")}
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface"
              aria-label={t("search.clearAria")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Filter dropdowns + date range + page size + sort */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.action")}</Label>
          <Select value={actionFilter} onValueChange={handleActionFilterChange}>
            <SelectTrigger className="h-9 rounded-md type-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              <SelectItem value="create">{t("action.create")}</SelectItem>
              <SelectItem value="update">{t("action.update")}</SelectItem>
              <SelectItem value="delete">{t("action.delete")}</SelectItem>
              <SelectItem value="export">{t("action.export")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.entity")}</Label>
          <Select value={entityFilter} onValueChange={handleEntityFilterChange}>
            <SelectTrigger className="h-9 rounded-md type-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              <SelectItem value="BudgetItem">{t("entities.BudgetItem")}</SelectItem>
              <SelectItem value="Payment">{t("entities.Payment")}</SelectItem>
              <SelectItem value="TimeEntry">{t("entities.TimeEntry")}</SelectItem>
              <SelectItem value="Contact">{t("entities.Contact")}</SelectItem>
              <SelectItem value="Project">{t("entities.Project")}</SelectItem>
              <SelectItem value="ProjectMember">{t("entities.ProjectMember")}</SelectItem>
              <SelectItem value="Note">{t("entities.Note")}</SelectItem>
              <SelectItem value="Export">{t("entities.Export")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* B7: User filter — populated from the `users` array in the API response */}
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.user")}</Label>
          <Select value={userFilter} onValueChange={handleUserFilterChange}>
            <SelectTrigger className="h-9 rounded-md type-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* B2: Date range — Od */}
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.from")}</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => handleFromDateChange(e.target.value)}
            className="h-9 rounded-md type-label"
            aria-label={t("filter.fromAria")}
          />
        </div>
        {/* B2: Date range — Do */}
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.to")}</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => handleToDateChange(e.target.value)}
            className="h-9 rounded-md type-label"
            aria-label={t("filter.toAria")}
          />
        </div>
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.sort")}</Label>
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9 rounded-md type-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">{t("sort.desc")}</SelectItem>
              <SelectItem value="asc">{t("sort.asc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="type-label font-medium text-on-surface-variant">{t("filter.pageSize")}</Label>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-9 rounded-md type-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center type-body text-on-surface-variant">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="type-label font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">{t("column.action")}</th>
                <th className="type-label font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">{t("column.detail")}</th>
                <th className="type-label font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">{t("column.author")}</th>
                <th className="type-label font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left whitespace-nowrap">{t("column.date")}</th>
                <th className="type-label font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left whitespace-nowrap">{t("column.time")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const authorName = entry.user?.name || entry.user?.email || t("author.unknown");
                const authorInitials =
                  authorName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase() ?? "")
                    .join("") || "?";
                const { date, time } = formatTimestamp(entry.createdAt);
                const description = describeChange(entry, describeHelpers);
                // B4: diff-viewer branch — for update entries where
                // both oldValue and newValue exist (with a field label).
                const hasDiff =
                  entry.action === "update" &&
                  !!entry.field &&
                  !!entry.oldValue &&
                  !!entry.newValue;
                // C6: deep-link target tab (if any)
                const entityTab = ENTITY_TAB_MAP[entry.entityType];
                return (
                  <tr key={entry.id} className="border-b border-outline-variant last:border-0 type-body hover:bg-surface-container-high">
                    {/* Úkon — action badge + entity type label */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="secondary"
                          className={cn("type-label font-semibold w-fit", ACTION_COLORS[entry.action] ?? "bg-muted text-muted-foreground")}
                        >
                          {actionLabel(entry.action)}
                        </Badge>
                        <span className="type-label text-on-surface-variant">
                          {entityLabel(entry.entityType)}
                        </span>
                      </div>
                    </td>
                    {/* Detail změny — human-readable description */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        {/* C6: Entity label — clickable deep-link when there's a tab mapping */}
                        {entry.entityLabel && (
                          entityTab ? (
                            <button
                              type="button"
                              onClick={() => setActiveTab(entityTab)}
                              className="type-body text-left font-medium text-primary hover:underline"
                              title={t("tooltip.goToTab", { name: entityLabel(entry.entityType) })}
                            >
                              {entry.entityLabel}
                            </button>
                          ) : (
                            <span className="type-body font-medium">{entry.entityLabel}</span>
                          )
                        )}
                        {/* B4: Diff viewer for update entries with both old & new values */}
                        {hasDiff && entry.field ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="type-label text-on-surface-variant/70">
                              {fieldLabel(entry.field)}:
                            </span>
                            <span className="type-body text-danger/70 line-through">
                              {/* B28: DB stores raw values; translate via getFieldValue. */}
                              {getFieldValue(entry.field, entry.oldValue)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-on-surface-variant/40" />
                            <span className="type-body text-success/80">
                              {getFieldValue(entry.field, entry.newValue)}
                            </span>
                          </div>
                        ) : (
                          <span className="type-body text-on-surface-variant">{description}</span>
                        )}
                      </div>
                    </td>
                    {/* Autor — avatar + name */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-7 w-7 shrink-0">
                          {entry.user?.image ? (
                            <AvatarImage src={entry.user.image} alt={authorName} />
                          ) : null}
                          <AvatarFallback className="bg-secondary-container text-[9px] font-bold text-secondary-container-foreground">
                            {authorInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="type-body font-medium truncate">{authorName}</span>
                      </div>
                    </td>
                    {/* Datum */}
                    <td className="px-3 py-2 align-top type-label text-on-surface-variant tabular-nums whitespace-nowrap">{date}</td>
                    {/* Čas */}
                    <td className="px-3 py-2 align-top type-label text-on-surface-variant tabular-nums whitespace-nowrap">{time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3">
          <div className="type-label text-on-surface-variant tabular-nums">
            {t("pagination.summary", {
              from: (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, total),
              total,
            })}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {t("pagination.prev")}
            </Button>
            <span className="type-label tabular-nums px-2">
              {t("pagination.pageOf", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {t("pagination.next")} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
