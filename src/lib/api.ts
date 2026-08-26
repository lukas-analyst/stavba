"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ===== Types =====
export type Project = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  starred: boolean;
  status: string;
  currency: string;
  totalBudget: number;
  startDate: string | null;
  endDate: string | null;
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
  note: string | null;
  unitPrice: string | null;
  planCost: number | null;
  flexibilityPercent: number | null;
  planDays: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  actualCost: number;
  actualHours: number;
  sortOrder: number;
  _count?: { payments: number; timeEntries: number };
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
  notes: string | null;
  rating: number | null;
  _count?: { timeEntries: number; payments: number };
};

export type Payment = {
  id: string;
  budgetItemId: string;
  contactId: string | null;
  amount: number;
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
  hours: number;
  description: string | null;
  budgetItem?: { id: string; category: string; subcategory: string | null };
  contact?: { id: string; name: string; type: string } | null;
};

export type Dashboard = {
  project: Project;
  totals: {
    planTotal: number;
    actualTotal: number;
    remaining: number;
    burnRate: number;
    worstCase: number;
    worstCaseRemaining: number;
    hoursTotal: number;
    daysPlanned: number;
    itemCount: number;
    requiredCount: number;
  };
  byPhase: { phase: string; plan: number; actual: number; hours: number; count: number }[];
  byCategory: { category: string; plan: number; actual: number; hours: number; count: number }[];
  alerts: {
    upcoming: BudgetItem[];
    overdue: BudgetItem[];
    overBudget: BudgetItem[];
    unscheduled: BudgetItem[];
  };
  timeline: {
    id: string;
    category: string;
    subcategory: string | null;
    phase: string;
    dateFrom: string | null;
    dateTo: string | null;
    planCost: number | null;
    actualCost: number;
    planDays: number | null;
    required: boolean;
  }[];
  recent: {
    payments: Payment[];
    timeEntries: TimeEntry[];
  };
};

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

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["dashboard", id] });
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
    },
  });
}

export function useUpdateBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BudgetItem> }) => {
      const res = await fetch(`/api/budget-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update budget item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
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
    },
  });
}

export function useUpdatePayment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Payment> }) => {
      const res = await fetch(`/api/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update payment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", projectId] });
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", projectId] }),
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
