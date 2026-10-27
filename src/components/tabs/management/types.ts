// ============================================================
// Shared types for the Project Management tab sub-components.
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx` so that each
// sub-component (ProjectInfoCard, PropertyMetadataCard,
// SharingSection, EnhancedAuditLog, DeleteProjectButton, QrCode)
// can import a single source-of-truth for cross-component types.
// Component-local constants (e.g. `INVITATION_STATUS_META`,
// `ACTION_COLORS`) stay inside their component files because they
// are only referenced there.
// ============================================================

import type { ProjectRole } from "@/lib/roles";

// ------------------------------------------------------------
// Sharing & invitations
// ------------------------------------------------------------

// A single project member row returned by GET /api/projects/[id]/members.
// `Member` mirrors the API shape (not the same as ProjectMember from
// `@/lib/api` because the sidebar code currently expects the camelCase
// variant — kept here to preserve the existing runtime contract).
export type Member = {
  id: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
};

// Full members endpoint payload — owner + members list.
export type MembersResponse = {
  owner: { id: string; name: string | null; email: string; image: string | null };
  members: Member[];
};

// Status of an invitation row. Drives both the badge color (looked up
// from `INVITATION_STATUS_META` in `sharing-section.tsx`) and the
// `invitationStatus.{status}` translation key.
export type InvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "revoked"
  | "expired";

// Invitation row returned by GET /api/projects/[id]/invitations.
// Pending invitations can be revoked by the owner; accepted/rejected/
// expired/revoked ones are kept for history (rendered in the collapsed
// "invitation history" details element).
export type InvitationRow = {
  id: string;
  inviteeEmail: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitedBy: { id: string; name: string | null; email: string };
};

// ------------------------------------------------------------
// Audit log
// ------------------------------------------------------------

// A single audit-log entry returned by GET /api/projects/[id]/audit.
// Used by `EnhancedAuditLog` (rendered in the audit section) and by
// `describeChange` (which converts it to a human-readable string).
export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
};

// Helpers carried into `describeChange` so the function doesn't need
// to instantiate its own `useTranslations` (which is a hook and can
// only run inside a component). The parent `EnhancedAuditLog` builds
// these once per render and passes them down.
export type DescribeHelpers = {
  tDescribe: (key: string, params?: Record<string, string | number>) => string;
  tRoles: (key: string) => string;
  fieldLabel: (field: string) => string;
  entityLabel: (entityType: string) => string;
};

// ------------------------------------------------------------
// Project info / metadata
// ------------------------------------------------------------

// Owner/admin can edit project info + metadata; editors get a
// read-only view. This flag is passed down to `ProjectInfoCard`
// and `PropertyMetadataCard` from the parent `ProjectManagementTab`
// (which derives it from `userRole`).
export type EditableProps = {
  /** When true the component renders a read-only display (no inputs). */
  readOnly?: boolean;
};

// The `userRole` is needed so the read-only mode can render a
// correct role badge (Editor / Admin / Viewer) — it doesn't gate
// any permission, just drives the badge label.
export type RoleAwareProps = {
  userRole: ProjectRole;
};
