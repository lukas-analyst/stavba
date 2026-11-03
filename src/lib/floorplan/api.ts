// ============================================================
// Floorplan module — React Query hooks
// ============================================================
// Data fetching + mutation hooks for the floorplan module.
// All hooks are scoped to a project ID and respect the project
// access control (owner/editor/viewer) on the server side.
// ============================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  FloorplanData,
  FloorplanFloor,
  FloorplanElement,
  FloorplanElementBudgetItemLink,
  FloorplanImportResult,
  FloorplanEditLock,
  FloorplanViewType,
} from "./types";

// ===== Query keys =====
export const floorplanKeys = {
  all: (projectId: string) => ["floorplan", projectId] as const,
  data: (projectId: string, viewType?: FloorplanViewType) =>
    ["floorplan", projectId, "data", viewType ?? "plan"] as const,
  layerMappings: (projectId: string) =>
    ["floorplan", projectId, "layer-mappings"] as const,
  lock: (projectId: string) => ["floorplan", projectId, "lock"] as const,
};

// ===== Hooks =====

// Fetch all floorplan data for a project (floors + elements + sources)
export function useFloorplan(projectId: string, viewType?: FloorplanViewType) {
  return useQuery<FloorplanData>({
    queryKey: floorplanKeys.data(projectId, viewType),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (viewType) params.set("viewType", viewType);
      const res = await fetch(
        `/api/projects/${projectId}/floorplan${params.size ? `?${params}` : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to fetch floorplan");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// Import DXF file
export function useImportFloorplan(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    FloorplanImportResult,
    Error,
    { file: File; floorId?: string; floorName?: string; viewType?: FloorplanViewType }
  >({
    mutationFn: async ({ file, floorId, floorName, viewType }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (floorId) formData.append("floorId", floorId);
      if (floorName) formData.append("floorName", floorName);
      if (viewType) formData.append("viewType", viewType);
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/import`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Update element (geometry, metadata, etc.)
export function useUpdateElement(projectId: string) {
  const qc = useQueryClient();
  return useMutation<FloorplanElement, Error, { elementId: string; data: Partial<FloorplanElement> }>({
    mutationFn: async ({ elementId, data }) => {
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${elementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to update element");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Delete element (with double-opt-in)
export function useDeleteElement(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    { deleted?: boolean; requiresConfirmation?: boolean; linkedBudgetItems?: unknown[] },
    Error,
    { elementId: string; confirm?: boolean }
  >({
    mutationFn: async ({ elementId, confirm }) => {
      const params = confirm ? "?confirm=true" : "";
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${elementId}${params}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete element");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Link element to BudgetItem (N:M)
export function useLinkBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    FloorplanElementBudgetItemLink,
    Error,
    {
      elementId: string;
      budgetItemId: string;
      role: string;
      metadata?: string;
    }
  >({
    mutationFn: async ({ elementId, budgetItemId, role, metadata }) => {
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${elementId}/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budgetItemId, role, metadata }),
        },
      );
      if (!res.ok) throw new Error("Failed to link budget item");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Unlink element from BudgetItem
export function useUnlinkBudgetItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    { deleted?: boolean },
    Error,
    { elementId: string; linkId: string; confirm?: boolean }
  >({
    mutationFn: async ({ elementId, linkId, confirm }) => {
      const params = confirm ? "?confirm=true" : "";
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${elementId}/links/${linkId}${params}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to unlink budget item");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Create floor
export function useCreateFloor(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    FloorplanFloor,
    Error,
    { name: string; level: number; viewType?: FloorplanViewType }
  >({
    mutationFn: async ({ name, level, viewType }) => {
      const res = await fetch(`/api/projects/${projectId}/floorplan/floors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, level, viewType: viewType ?? "plan" }),
      });
      if (!res.ok) throw new Error("Failed to create floor");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Acquire edit lock
export function useAcquireEditLock(projectId: string) {
  const qc = useQueryClient();
  return useMutation<FloorplanEditLock, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/floorplan/lock`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to acquire lock");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.lock(projectId) });
    },
  });
}

// Release edit lock (user clicked "Save")
export function useReleaseEditLock(projectId: string) {
  const qc = useQueryClient();
  return useMutation<{ released: boolean }, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/floorplan/lock`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to release lock");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.lock(projectId) });
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Delete a floor (with double-opt-in)
export function useDeleteFloor(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    { deleted?: boolean; requiresConfirmation?: boolean; floor?: { name: string; elementsCount: number; sourcesCount: number } },
    Error,
    { floorId: string; confirm?: boolean }
  >({
    mutationFn: async ({ floorId, confirm }) => {
      const params = confirm ? "?confirm=true" : "";
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/floors/${floorId}${params}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete floor");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Duplicate a floor
export function useDuplicateFloor(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; name: string; viewType: string },
    Error,
    { floorId: string }
  >({
    mutationFn: async ({ floorId }) => {
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/floors/${floorId}/duplicate`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Failed to duplicate floor");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: floorplanKeys.all(projectId) });
    },
  });
}

// Update element geometry (drag/resize)
export function useUpdateElementGeometry(projectId: string) {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { elementId: string; data: { x?: number; y?: number; width?: number; height?: number } }
  >({
    mutationFn: async ({ elementId, data }) => {
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${elementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to update element");
      return res.json();
    },
    // No onSuccess invalidation — we update local state for smooth UX
    // (the parent component handles state update)
  });
}
