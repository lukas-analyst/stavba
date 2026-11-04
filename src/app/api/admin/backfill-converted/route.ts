import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { requireUser } from "@/lib/authz";

export async function POST() {
  const t = await getTranslations("api.errors");
  const { user, response } = await requireUser();
  if (response) return response;
  if (!user?.isAdmin) {
    return NextResponse.json(
      { error: t("admin.adminOnly") },
      { status: 403 },
    );
  }

  try {
    // 1. Backfill payments: amountConverted = amount (no foreign currency)
    const paymentResult = await db.payment.updateMany({
      where: {
        amountConverted: 0,
        OR: [{ currency: null }, { currency: "" }],
      },
      data: { amountConverted: db.payment.fields.amount },
    });

    // 2. Backfill budget items: planCostConverted = planCost
    const budgetResult = await db.budgetItem.updateMany({
      where: {
        planCostConverted: null,
        OR: [{ planCostCurrency: null }, { planCostCurrency: "" }],
      },
      data: { planCostConverted: db.budgetItem.fields.planCost },
    });

    // 3. Bust ALL server-side caches
    revalidateTag("spending-trends");
    revalidateTag("dashboards");
    revalidateTag("payments");
    revalidateTag("budgets");
    revalidateTag("contact-stats");

    return NextResponse.json({
      success: true,
      paymentsUpdated: paymentResult.count,
      budgetItemsUpdated: budgetResult.count,
      cacheBusted: ["spending-trends", "dashboards", "payments", "budgets", "contact-stats"],
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: t("admin.backfillFailed") },
      { status: 500 },
    );
  }
}
