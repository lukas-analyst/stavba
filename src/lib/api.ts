"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ===== Server-side cache invalidation =====
// After a mutation succeeds on the client, we also bust the server-side
// Next.js cache (unstable_cache + revalidateTag) so the next dashboard
// fetch returns fresh data instead of the stale 60-second-cached response.
//
// Tags are fixed strings ("dashboards", "spending-trends", "projects")
// because Next.js's unstable_cache requires static tag strings.
//
// This is fire-and-forget — we don't await it and don't surface errors to
// the user (the React Query client-side cache is invalidated separately
// and will trigger a refetch regardless).
export function bustServerCache(projectId: string, tags: string[] = ["dashboards"]) {
  if (typeof window === "undefined") return; // server-side no-op
  void projectId; // projectId is kept in the signature for API compatibility
  fetch("/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
    keepalive: true, // survives page navigation
  }).catch(() => {
    // Silent — server cache will expire via TTL (60s) anyway.
  });
}

// ===== Types =====
export type Project = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  starred: boolean;
  status: string;
  currency: string;
  totalBudget: number;
  startDate: string | null;
  endDate: string | null;
  categoryOrder: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { budgetItems: number; contacts: number };
  stats?: {
    planTotal: number;
    actualTotal: number;
    remaining: number;
    burnRate: number;
    hoursTotal: number;
    daysPlanned: number;
    itemCount: number;
  };
};

export type BudgetItem = {
  id: string;
  projectId: string;
  category: string;
  subcategory: string | null;
  element: string | null;
  phase: string;
  required: boolean;
  completed: boolean;
  rejected: boolean;
  note: string | null;
  unitPrice: string | null;
  parentId: string | null;
  dependsOnId: string | null;
  planCost: number | null;
  flexibilityPercent: number | null;
  planDays: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  actualCost: number;
  actualHours: number;
  sortOrder: number;
  _count?: { payments: number; timeEntries: number; comments: number };
  children?: BudgetItem[];
};

export type Contact = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  ico: string | null;
  dic: string | null;
  website: string | null;
  notes: string | null;
  rating: number | null;
  _count?: { timeEntries: number; payments: number };
};

export type Payment = {
  id: string;
  budgetItemId: string;
  contactId: string | null;
  amount: number;
  invoiceTotal: number | null;
  installmentOf: string | null;
  vatRate: number | null;
  vatAmount: number | null;
  date: string;
  type: string;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  budgetItem?: { id: string; category: string; subcategory: string | null };
  contact?: { id: string; name: string; type: string } | null;
};

export type TimeEntry = {
  id: string;
  budgetItemId: string;
  contactId: string | null;
  workerName: string;
  workerType: string;
  date: string;
  dateTo: string | null;
  hours: number;
  description: string | null;
  budgetItem?: { id: string; category: string; subcategory: string | null };
  contact?: { id: string; name: string; type: string } | null;
};

// Re-export shared API types (so existing imports keep working).
// The actual type definitions live in `./api-types` to avoid circular
// imports with the server-side cache module.
export type { AlertItem, DashboardProject, DashboardData } from "./api-types";

// Local alias so the `Dashboard` type name stays the same for existing code.
import type { DashboardData } from "./api-types";
export type Dashboard = DashboardData;

// ===== Projects =====
export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useCreateProjectFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      address?: string;
      description?: string;
      templateType: string;
      scope?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const res = await fetch("/api/projects/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create project from template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async (data: Partial<Project>) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ["projects"] });
      // Snapshot previous value for rollback
      const previousProjects = qc.getQueryData<Project[]>(["projects"]);
      // Optimistically update the matching project in the list cache
      qc.setQueryData<Project[]>(["projects"], (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...data } : p))
      );
      return { previousProjects };
    },
    onError: (_err, _vars, context) => {
      // Rollback to the snapshot on failure
      if (context?.previousProjects) {
        qc.setQueryData(["projects"], context.previousProjects);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["dashboard", id] });
      bustServerCache(id);
    },
    mutationFn: async (data: Partial<Project>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ===== Budget Items =====
export function useBudgetItems(projectId: string | null) {
  return useQuery<BudgetItem[]>({
    queryKey: ["budget", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/budget`);
      if (!res.ok) throw new Error("Failed to load budget");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<BudgetItem>) => {
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create budget item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

export function useUpdateBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ["budget", projectId] });
      // Snapshot previous value for rollback
      const previousItems = qc.getQueryData<BudgetItem[]>(["budget", projectId]);
      // Optimistically update the matching item in the cache
      qc.setQueryData<BudgetItem[]>(["budget", projectId], (old) =>
        old?.map((item) => (item.id === id ? { ...item, ...data } : item))
      );
      return { previousItems };
    },
    onError: (_err, _vars, context) => {
      // Rollback to the snapshot on failure
      if (context?.previousItems) {
        qc.setQueryData(["budget", projectId], context.previousItems);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
    mutationFn: async ({ id, data }: { id: string; data: Partial<BudgetItem> }) => {
      const res = await fetch(`/api/budget-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update budget item");
      return res.json();
    },
  });
}

export function useDeleteBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budget-items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete budget item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

export function useDuplicateBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budget-items/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to duplicate budget item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

// Reorder items and/or categories
export function useReorder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async (data: {
      items?: { id: string; sortOrder: number }[];
      categoryOrder?: string[];
    }) => {
      // Snapshot both caches for rollback
      const previousItems = qc.getQueryData<BudgetItem[]>(["budget", projectId]);
      const previousProjects = qc.getQueryData<Project[]>(["projects"]);

      // Cancel any outgoing refetches so they don't overwrite our optimistic state.
      await qc.cancelQueries({ queryKey: ["budget", projectId] });
      await qc.cancelQueries({ queryKey: ["projects"] });

      // Optimistically update item sortOrder in the budget cache so the
      // UI reorders instantly while the PATCH is in flight.
      if (data.items && previousItems) {
        const sortOrderMap = new Map(data.items.map((it) => [it.id, it.sortOrder]));
        qc.setQueryData<BudgetItem[]>(["budget", projectId], (old) => {
          if (!old) return old;
          const updated = old.map((it) =>
            sortOrderMap.has(it.id)
              ? { ...it, sortOrder: sortOrderMap.get(it.id)! }
              : it,
          );
          // Re-sort by sortOrder (matching the API's `orderBy:
          // [sortOrder asc, createdAt asc]`) so the optimistic cache is
          // visually in the new order before the refetch lands.
          return [...updated].sort((a, b) => {
            const sa = a.sortOrder ?? 0;
            const sb = b.sortOrder ?? 0;
            if (sa !== sb) return sa - sb;
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            return ta - tb;
          });
        });
      }

      // Optimistically update the project's `categoryOrder` JSON field so
      // categories reorder instantly in the budget table.
      if (data.categoryOrder && previousProjects) {
        const newCategoryOrder = JSON.stringify(data.categoryOrder);
        qc.setQueryData<Project[]>(["projects"], (old) =>
          old?.map((p) =>
            p.id === projectId ? { ...p, categoryOrder: newCategoryOrder } : p,
          ),
        );
      }

      return { previousItems, previousProjects };
    },
    onError: (_err, _vars, context) => {
      // Rollback to the snapshots on failure so the UI doesn't show a
      // reordered state that the server rejected.
      if (context?.previousItems) {
        qc.setQueryData(["budget", projectId], context.previousItems);
      }
      if (context?.previousProjects) {
        qc.setQueryData(["projects"], context.previousProjects);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
    mutationFn: async (data: {
      items?: { id: string; sortOrder: number }[];
      categoryOrder?: string[];
    }) => {
      const res = await fetch(`/api/projects/${projectId}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
  });
}

// ===== Export / Import =====
export function useExportState() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Failed to export");
      const blob = await res.blob();
      // Try to get filename from Content-Disposition
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename =
        match?.[1] ?? `stavba-export-${new Date().toISOString().substring(0, 10)}.json`;
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { filename };
    },
  });
}

export function useImportState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to import");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

// ===== CSV Export (per-project) =====
export function useExportCsv(projectId: string) {
  return useMutation({
    mutationFn: async (type: "budget" | "payments" | "time" | "contacts") => {
      const res = await fetch(`/api/projects/${projectId}/export-csv?type=${type}`);
      if (!res.ok) throw new Error("Failed to export CSV");
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1]
        ? decodeURIComponent(match[1])
        : `${projectId}-${type}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { filename };
    },
  });
}

// ===== Payments =====
export function usePayments(projectId: string | null) {
  return useQuery<Payment[]>({
    queryKey: ["payments", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/payments`);
      if (!res.ok) throw new Error("Failed to load payments");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreatePayment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Payment> & { amount: number; budgetItemId: string }) => {
      const res = await fetch(`/api/projects/${projectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create payment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

export function useUpdatePayment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ["payments", projectId] });
      // Snapshot previous value for rollback
      const previousPayments = qc.getQueryData<Payment[]>(["payments", projectId]);
      // Optimistically update the matching payment in the cache
      qc.setQueryData<Payment[]>(["payments", projectId], (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...data } : p))
      );
      return { previousPayments };
    },
    onError: (_err, _vars, context) => {
      // Rollback to the snapshot on failure
      if (context?.previousPayments) {
        qc.setQueryData(["payments", projectId], context.previousPayments);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["payments", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
    mutationFn: async ({ id, data }: { id: string; data: Partial<Payment> }) => {
      const res = await fetch(`/api/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update payment");
      return res.json();
    },
  });
}

export function useDeletePayment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete payment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

// ===== Time Entries =====
export function useTimeEntries(projectId: string | null) {
  return useQuery<TimeEntry[]>({
    queryKey: ["time", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/time`);
      if (!res.ok) throw new Error("Failed to load time entries");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<TimeEntry> & { hours: number; budgetItemId: string }) => {
      const res = await fetch(`/api/projects/${projectId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create time entry");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

export function useUpdateTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ["time", projectId] });
      // Snapshot previous value for rollback
      const previousEntries = qc.getQueryData<TimeEntry[]>(["time", projectId]);
      // Optimistically update the matching entry in the cache
      qc.setQueryData<TimeEntry[]>(["time", projectId], (old) =>
        old?.map((e) => (e.id === id ? { ...e, ...data } : e))
      );
      return { previousEntries };
    },
    onError: (_err, _vars, context) => {
      // Rollback to the snapshot on failure
      if (context?.previousEntries) {
        qc.setQueryData(["time", projectId], context.previousEntries);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["time", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
    mutationFn: async ({ id, data }: { id: string; data: Partial<TimeEntry> & { hours?: number } }) => {
      const res = await fetch(`/api/time-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update time entry");
      return res.json();
    },
  });
}

export function useDeleteTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/time-entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete time entry");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

// ===== Contacts =====
export function useContacts(projectId: string | null) {
  return useQuery<Contact[]>({
    queryKey: ["contacts", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts`);
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Contact>) => {
      const res = await fetch(`/api/projects/${projectId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create contact");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", projectId] }),
  });
}

export function useUpdateContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Contact> }) => {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", projectId] }),
  });
}

export function useDeleteContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contact");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", projectId] });
      qc.invalidateQueries({ queryKey: ["contactStats", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      bustServerCache(projectId);
    },
  });
}

// ===== Dashboard =====
export function useDashboard(projectId: string | null) {
  return useQuery<Dashboard>({
    queryKey: ["dashboard", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/dashboard`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// ===== Contact Stats =====
export type ContactStat = {
  contactId: string;
  name: string;
  type: string;
  rating: number | null;
  totalPaid: number;
  totalHours: number;
  paymentCount: number;
  timeEntryCount: number;
  lastActivity: string | null;
};

export type WorkerStat = {
  name: string;
  hours: number;
  entries: number;
  type: string;
};

export function useContactStats(projectId: string | null) {
  return useQuery<{ contactStats: ContactStat[]; workerStats: WorkerStat[] }>({
    queryKey: ["contactStats", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contact-stats`);
      if (!res.ok) throw new Error("Failed to load contact stats");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// ===== Spending Trend =====
export type SpendingMonth = {
  key: string;
  label: string;
  spend: number;
  hours: number;
};

export function useSpendingTrend(projectId: string | null) {
  return useQuery<{
    months: SpendingMonth[];
    totals: { totalSpend: number; totalHours: number; paymentCount: number; timeEntryCount: number };
  }>({
    queryKey: ["spendingTrend", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/spending-trend`);
      if (!res.ok) throw new Error("Failed to load spending trend");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// ===== Audit Log =====
export type AuditLog = {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export function useAuditLog(projectId: string | null) {
  return useQuery<AuditLog[]>({
    queryKey: ["auditLog", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/audit?limit=100`);
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// ===== Snapshots =====
export type Snapshot = {
  id: string;
  projectId: string;
  label: string;
  planTotal: number;
  actualTotal: number;
  remaining: number;
  burnRate: number;
  hoursTotal: number;
  daysPlanned: number;
  itemCount: number;
  completedCount: number;
  savedTotal: number;
  createdAt: string;
};

export function useSnapshots(projectId: string | null) {
  return useQuery<Snapshot[]>({
    queryKey: ["snapshots", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/snapshots`);
      if (!res.ok) throw new Error("Failed to load snapshots");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateSnapshot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Failed to create snapshot");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots", projectId] });
    },
  });
}

export function useDeleteSnapshot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/snapshots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete snapshot");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots", projectId] });
    },
  });
}

// ===== Comments =====
export type Comment = {
  id: string;
  budgetItemId: string;
  author: string;
  text: string;
  createdAt: string;
};

export function useComments(budgetItemId: string | null) {
  return useQuery<Comment[]>({
    queryKey: ["comments", budgetItemId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-items/${budgetItemId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
    enabled: !!budgetItemId,
    // Comments are conversation-like and users expect to always see the
    // latest ones when they open a dialog. Force a refetch on every mount
    // and treat the data as immediately stale.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useCreateComment(budgetItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { author: string; text: string }) => {
      const res = await fetch(`/api/budget-items/${budgetItemId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create comment");
      return res.json();
    },
    onSuccess: () => {
      // Remove any cached data first, then invalidate so the query
      // refetches from the server even if staleTime was non-zero.
      qc.removeQueries({ queryKey: ["comments", budgetItemId] });
      qc.invalidateQueries({ queryKey: ["comments", budgetItemId] });
    },
  });
}

export function useDeleteComment(budgetItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete comment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", budgetItemId] });
    },
  });
}

// ===== Notes (per-project plain-text notes with author + timestamp) =====
export type Note = {
  id: string;
  projectId: string;
  author: string;
  text: string;
  createdAt: string;
};

export function useNotes(projectId: string | null) {
  return useQuery<Note[]>({
    queryKey: ["notes", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/notes`);
      if (!res.ok) throw new Error("Failed to load notes");
      return res.json();
    },
    enabled: !!projectId,
    // Always show the latest notes when the tab is opened.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useCreateNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { author: string; text: string }) => {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create note");
      return res.json();
    },
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["notes", projectId] });
      const previousNotes = qc.getQueryData<Note[]>(["notes", projectId]);
      // Optimistically prepend the new note so it appears at the top of
      // the list immediately. We use a temp id and the current time so
      // the UI has something to render while the POST is in flight.
      const optimistic: Note = {
        id: `temp-${Date.now()}`,
        projectId,
        author: (data.author || "Anonym").trim().slice(0, 100) || "Anonym",
        text: data.text.trim(),
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<Note[]>(["notes", projectId], (old) => [
        optimistic,
        ...(old ?? []),
      ]);
      return { previousNotes, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) {
        qc.setQueryData(["notes", projectId], context.previousNotes);
      }
    },
    onSuccess: (created, _vars, context) => {
      // Replace the temp optimistic note with the real one returned by the API.
      if (context?.optimisticId) {
        qc.setQueryData<Note[]>(["notes", projectId], (old) =>
          old?.map((n) => (n.id === context.optimisticId ? created : n)),
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notes", projectId] });
    },
  });
}

// Update an existing note. Accepts partial { text?, author? } — at least
// one of the two must be provided. Uses optimistic update so the UI feels
// instant when the user saves an edit.
export function useUpdateNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; text?: string; author?: string }) => {
      const res = await fetch(`/api/notes/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(data.text !== undefined ? { text: data.text } : {}),
          ...(data.author !== undefined ? { author: data.author } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to update note");
      return res.json();
    },
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["notes", projectId] });
      const previousNotes = qc.getQueryData<Note[]>(["notes", projectId]);
      qc.setQueryData<Note[]>(["notes", projectId], (old) =>
        old?.map((n) =>
          n.id === data.id
            ? {
                ...n,
                ...(data.text !== undefined ? { text: data.text.trim() } : {}),
                ...(data.author !== undefined
                  ? { author: (data.author.trim() || "Anonym").slice(0, 100) }
                  : {}),
              }
            : n,
        ),
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) {
        qc.setQueryData(["notes", projectId], context.previousNotes);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notes", projectId] });
    },
  });
}

export function useDeleteNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notes", projectId] });
      const previousNotes = qc.getQueryData<Note[]>(["notes", projectId]);
      qc.setQueryData<Note[]>(["notes", projectId], (old) =>
        old?.filter((n) => n.id !== id),
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) {
        qc.setQueryData(["notes", projectId], context.previousNotes);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notes", projectId] });
    },
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      return res.json();
    },
  });
}
