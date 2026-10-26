import type { Payment } from "@/lib/api";
import type { RecurringInterval } from "@/lib/recurring";
import type {
  useCreatePayment,
  useUpdatePayment,
  useUpdateBudgetItem,
} from "@/lib/api";

// Map a RecurringInterval value to the i18n key under
// `tabs.payments.dialog.recurring.*`. Used by the row badge and the
// dialog Select to avoid dynamic-key lookups (next-intl's strict typing
// prefers literal keys, so we list them explicitly here).
export const RECURRING_INTERVAL_LABEL_KEYS: Record<RecurringInterval, string> = {
  weekly: "dialog.recurring.weekly",
  monthly: "dialog.recurring.monthly",
  quarterly: "dialog.recurring.quarterly",
  yearly: "dialog.recurring.yearly",
};

// ===== Sorting =====
export type SortKey =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "type"
  | "contact"
  | "vendor";

// Map SortKey (kebab-case) to translation key (camelCase) under `tabs.payments.sort.*`
export const SORT_LABEL_KEYS: Record<SortKey, string> = {
  "date-desc": "dateDesc",
  "date-asc": "dateAsc",
  "amount-desc": "amountDesc",
  "amount-asc": "amountAsc",
  "type": "type",
  "contact": "contact",
  "vendor": "vendor",
};

export const SORT_KEYS: SortKey[] = [
  "date-desc",
  "date-asc",
  "amount-desc",
  "amount-asc",
  "type",
  "contact",
  "vendor",
];

// RowMeta — installment grouping metadata passed from PaymentsTab's
// block-layout pass down to each PaymentRow. Identifies whether the row
// is the parent (first installment), a child (subsequent installment),
// or a standalone payment (no meta at all).
export type RowMeta = {
  isInstallmentParent: boolean;
  isInstallmentChild: boolean;
  installmentNumber: number;
  totalInstallments: number;
  invoiceTotal: number | null;
  paidTotal: number;
  remaining: number;
  percent: number;
  parentId?: string;
};

// ===== Payment dialog (create + edit) =====
export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /**
   * Project's default currency (ISO 4217 — e.g. "CZK", "EUR"). Resolved
   * by the parent `PaymentsTab` via `useProjects()`. The CurrencySelect
   * marks this currency with a "(default)" badge, and the conversion
   * preview converts foreign amounts back into this currency.
   */
  projectCurrency?: string;
  budgetItems: { id: string; category: string; subcategory: string | null; parentId?: string | null; completed?: boolean }[];
  contacts: { id: string; name: string; type: string }[];
  /**
   * All payments in the project. Used to populate the "Připojit k faktuře"
   * Select in edit mode — lists installment-parent payments (invoiceTotal != null)
   * that the currently edited payment can be linked to as an installment.
   */
  payments?: Payment[];
  createPayment: ReturnType<typeof useCreatePayment>;
  updatePayment?: ReturnType<typeof useUpdatePayment>;
  updateBudgetItem: ReturnType<typeof useUpdateBudgetItem>;
  payment?: Payment | null;
  onClose?: () => void;
  /**
   * When set, dialog opens in "add installment" mode — a create flow that
   * pre-fills the parent's budgetItem/contact/vendor/invoiceNumber and forces
   * `installmentOf = prefillParent.id` on submit. The "isInvoice" toggle is
   * hidden and the user can't pick a different invoiceTotal.
   */
  prefillParent?: Payment | null;
  /**
   * Called when the user clicks "Přidat splátku k této faktuře" after picking
   * a budget item that already has an invoice. The parent component switches
   * to "add installment" mode using the discovered parent.
   */
  onAddInstallmentToExisting?: (parent: Payment) => void;
}
