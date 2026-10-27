"use client";

import { useTranslations } from "next-intl";
import { TableRow, TableCell } from "@/components/ui/table";
import { Plus } from "lucide-react";
import type { Payment } from "@/lib/api";

// ===== "Add installment" inline row (rendered at the end of an installment group) =====
// Small inline button styled as a table row — gives the user a one-click
// affordance to add another installment to the parent invoice without
// having to open the parent's edit dialog and find the action there.
//
// The whole row is one big <button> rendered inside a single TableCell
// that spans all 8 columns of the payments table.
export function AddInstallmentRow({
  parent,
  onAdd,
}: {
  parent: Payment;
  onAdd: () => void;
}) {
  const t = useTranslations("tabs.payments");
  return (
    <TableRow className="group hover:bg-muted/20">
      <TableCell colSpan={8} className="py-0.5 pl-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 type-label-sm text-on-surface-variant/80 transition-colors hover:bg-surface-container-high hover:text-on-surface"
          title={t("row.addInstallmentTitle", { vendor: parent.vendor ?? parent.invoiceNumber ?? parent.id.slice(0, 6) })}
        >
          <Plus className="h-3 w-3" />
          {t("row.addInstallment")}
        </button>
      </TableCell>
    </TableRow>
  );
}
