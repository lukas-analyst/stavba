// =====================================================================
// PDF Generator — server-side entry point
// ---------------------------------------------------------------------
// Fetches project + budget items from the DB, computes totals, alerts,
// and projection, resolves currency conversion if the target currency
// differs from the project's currency, assembles a PdfReportData object,
// and renders the PDF to a Node.js Buffer using @react-pdf/renderer.
//
// Usage (typically from a Next.js route handler):
//   import { generatePdf, generateFilename } from "@/lib/pdf/pdf-generator";
//   const buffer = await generatePdf(options);
//   const filename = generateFilename(project.name, options.locale);
//   return new Response(buffer, {
//     headers: {
//       "Content-Type": "application/pdf",
//       "Content-Disposition": `attachment; filename="${filename}"`,
//     },
//   });
// =====================================================================

import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { dbRead } from "@/lib/db";
import { convertAmount } from "@/lib/currency";
import { PHASES, normalizePhase } from "@/lib/format";
import { ReportDocument } from "./pdf-components";
import type {
  PdfExportOptions,
  PdfReportData,
  PdfBudgetItem,
  PdfAlertItem,
  PdfPhaseSummary,
  PdfPayment,
  PdfTimeEntry,
  PdfContact,
} from "./pdf-types";

// =====================================================================
// Field selection — only fetch what the PDF actually uses (kept narrow
// for performance + to avoid leaking fields the report doesn't need).
// =====================================================================

const PROJECT_SELECT = {
  id: true,
  name: true,
  address: true,
  fullAddress: true,
  description: true,
  status: true,
  currency: true,
  startDate: true,
  endDate: true,
  totalBudget: true,
  heatLoss: true,
  energyRating: true,
  floorArea: true,
  floors: true,
  propertyNote: true,
} as const;

const BUDGET_ITEM_SELECT = {
  id: true,
  category: true,
  subcategory: true,
  element: true,
  phase: true,
  planCost: true,
  planCostCurrency: true,
  planCostConverted: true,
  actualCost: true,
  completed: true,
  rejected: true,
  dateFrom: true,
  dateTo: true,
  actualHours: true,
  sortOrder: true,
  parentId: true,
  contact: {
    select: { name: true },
  },
} as const;

type DbBudgetItem = Awaited<
  ReturnType<typeof dbRead.budgetItem.findMany<{ select: typeof BUDGET_ITEM_SELECT }>>
>[number];

// =====================================================================
// generatePdf — main entry point
// =====================================================================

export async function generatePdf(options: PdfExportOptions): Promise<Buffer> {
  // ─── 1) Fetch project ────────────────────────────────────────────
  const project = await dbRead.project.findUnique({
    where: { id: options.projectId },
    select: PROJECT_SELECT,
  });
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  // ─── 2) Fetch budget items ──────────────────────────────────────
  // Sort by sortOrder + createdAt to match the budget tab ordering.
  const dbItems = await dbRead.budgetItem.findMany({
    where: { projectId: options.projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: BUDGET_ITEM_SELECT,
  });

  // ─── 3) Currency conversion ──────────────────────────────────────
  // If options.currency differs from project.currency, convert every
  // plan + actual amount from project.currency → options.currency
  // using today's exchange rate. Falls back to the original amount
  // when no rate is available (convertAmount returns null).
  //
  // NOTE: `planCostConverted` is already in project.currency (computed
  // at item-save time). We use it as the source amount for conversion,
  // falling back to `planCost` if it's null (which happens when the
  // item's planCostCurrency equals the project currency — in which case
  // planCostConverted was set equal to planCost at save time anyway).
  const targetCurrency = options.currency;
  const projectCurrency = project.currency;
  const needsConversion = targetCurrency !== projectCurrency;
  const today = new Date();

  const toTarget = async (amountInProjectCurrency: number): Promise<number> => {
    if (!needsConversion) return amountInProjectCurrency;
    const conversion = await convertAmount(
      amountInProjectCurrency,
      projectCurrency,
      targetCurrency,
      today,
    );
    return conversion?.converted ?? amountInProjectCurrency;
  };

  const convertedItems: PdfBudgetItem[] = await Promise.all(
    dbItems.map(async (item: DbBudgetItem): Promise<PdfBudgetItem> => {
      const planInProject = item.planCostConverted ?? item.planCost ?? 0;
      const planInTarget = await toTarget(planInProject);
      const actualInTarget = await toTarget(item.actualCost ?? 0);
      return {
        id: item.id,
        category: item.category,
        subcategory: item.subcategory,
        element: item.element,
        phase: item.phase,
        // Keep original planCost + planCostCurrency for reference.
        planCost: item.planCost,
        actualCost: actualInTarget,
        planCostCurrency: item.planCostCurrency,
        // planCostConverted is now in the TARGET currency (for display).
        planCostConverted: planInTarget,
        completed: item.completed,
        rejected: item.rejected,
        dateFrom: item.dateFrom,
        dateTo: item.dateTo,
        actualHours: item.actualHours,
        sortOrder: item.sortOrder,
        contactName: item.contact?.name ?? null,
        parentId: item.parentId,
      };
    }),
  );

  // ─── 4) Compute totals ──────────────────────────────────────────
  let planTotal = 0;
  let actualTotal = 0;
  let hoursTotal = 0;
  let savedTotal = 0;
  let completedCount = 0;

  for (const item of convertedItems) {
    const plan = item.planCostConverted ?? item.planCost ?? 0;
    planTotal += plan;
    actualTotal += item.actualCost;
    hoursTotal += item.actualHours;
    if (item.completed) {
      completedCount++;
      // savedTotal: only count completed items where the actual cost
      // came in below the planned cost.
      if (plan > item.actualCost) {
        savedTotal += plan - item.actualCost;
      }
    }
  }

  const remaining = planTotal - actualTotal;
  const itemCount = convertedItems.length;

  // Projection: average overrun ratio from completed items with plan > 0.
  // projectedFinal = planTotal * avgOverrunRatio (if completedCount > 0),
  // else projectedFinal = planTotal (no signal yet).
  let projectedFinal = planTotal;
  const completedWithPlan = convertedItems.filter(
    (i) => i.completed && (i.planCostConverted ?? i.planCost ?? 0) > 0,
  );
  if (completedWithPlan.length > 0) {
    const ratios = completedWithPlan.map((i) => {
      const plan = i.planCostConverted ?? i.planCost ?? 1;
      return i.actualCost / plan;
    });
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    projectedFinal = planTotal * avgRatio;
  }
  const projectedOverrun = projectedFinal - planTotal;

  // ─── 5) Compute alerts ──────────────────────────────────────────
  //   - overdue:    dateTo < now  AND !completed AND !rejected
  //   - upcoming:   dateTo within next 7 days  AND !completed AND !rejected
  //   - overBudget: actualCost > planCost  AND planCost > 0
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);

  const toAlert = (item: PdfBudgetItem): PdfAlertItem => ({
    category: item.category,
    subcategory: item.subcategory,
    phase: item.phase,
    planCost: item.planCostConverted ?? item.planCost,
    actualCost: item.actualCost,
    dateFrom: item.dateFrom,
    dateTo: item.dateTo,
  });

  const overdue: PdfAlertItem[] = [];
  const upcoming: PdfAlertItem[] = [];
  const overBudget: PdfAlertItem[] = [];

  for (const item of convertedItems) {
    // Over-budget check applies to non-completed items only (completed
    // items are "finalized" — their overrun is already baked in).
    if (!item.completed && !item.rejected) {
      const plan = item.planCostConverted ?? item.planCost ?? 0;
      if (plan > 0 && item.actualCost > plan) {
        overBudget.push(toAlert(item));
      }
    }

    // Skip date-based alerts for completed / rejected items.
    if (item.completed || item.rejected) continue;
    if (!item.dateTo) continue;

    const dateTo = new Date(item.dateTo);
    if (Number.isNaN(dateTo.getTime())) continue;

    if (dateTo < now) {
      overdue.push(toAlert(item));
    } else if (dateTo <= sevenDaysFromNow) {
      upcoming.push(toAlert(item));
    }
  }

  // ─── 6) Compute byPhase (required by PdfReportData) ─────────────
  const byPhaseMap = new Map<string, PdfPhaseSummary>();
  for (const item of convertedItems) {
    const phaseKey = item.phase || "unspecified";
    const existing = byPhaseMap.get(phaseKey) ?? {
      phase: item.phase,
      plan: 0,
      actual: 0,
      hours: 0,
    };
    existing.plan += item.planCostConverted ?? item.planCost ?? 0;
    existing.actual += item.actualCost;
    existing.hours += item.actualHours;
    byPhaseMap.set(phaseKey, existing);
  }
  const byPhase = Array.from(byPhaseMap.values());

  // ─── 6.3) Fetch payments ──────────────────────────────────────────
  const dbPayments = await dbRead.payment.findMany({
    where: { budgetItem: { projectId: options.projectId } },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      amount: true,
      amountConverted: true,
      currency: true,
      type: true,
      vendor: true,
      invoiceNumber: true,
      vatRate: true,
      vatAmount: true,
      description: true,
      budgetItem: {
        select: { category: true, subcategory: true },
      },
      contact: {
        select: { name: true },
      },
    },
  });

  const payments: PdfPayment[] = await Promise.all(
    dbPayments.map(async (p): Promise<PdfPayment> => {
      const convertedAmount = needsConversion
        ? (await toTarget(p.amountConverted || p.amount))
        : (p.amountConverted || p.amount);
      return {
        id: p.id,
        date: p.date,
        amount: p.amount,
        amountConverted: convertedAmount,
        currency: p.currency,
        type: p.type,
        vendor: p.vendor,
        invoiceNumber: p.invoiceNumber,
        vatRate: p.vatRate,
        vatAmount: p.vatAmount,
        description: p.description,
        budgetItemCategory: p.budgetItem?.category ?? null,
        budgetItemSubcategory: p.budgetItem?.subcategory ?? null,
        contactName: p.contact?.name ?? null,
      };
    }),
  );

  // ─── 6.4) Fetch time entries ─────────────────────────────────────
  const dbTimeEntries = await dbRead.timeEntry.findMany({
    where: { budgetItem: { projectId: options.projectId } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      workerName: true,
      workerType: true,
      date: true,
      dateTo: true,
      hours: true,
      workerCount: true,
      description: true,
      budgetItem: {
        select: { category: true, subcategory: true },
      },
    },
  });

  const timeEntries: PdfTimeEntry[] = dbTimeEntries.map((te) => ({
    id: te.id,
    workerName: te.workerName,
    workerType: te.workerType,
    date: te.date,
    dateTo: te.dateTo,
    hours: te.hours,
    workerCount: te.workerCount,
    description: te.description,
    budgetItemCategory: te.budgetItem?.category ?? null,
    budgetItemSubcategory: te.budgetItem?.subcategory ?? null,
  }));

  // ─── 6.4b) Fetch contacts (suppliers / contractors) ──────────────
  // The PDF's contacts section lists every Contact on the project with
  // their type, role, contact details, and a denormalized count of how
  // many payments + time entries reference them (handy for spotting the
  // most-active suppliers at a glance).
  const dbContacts = await dbRead.contact.findMany({
    where: { projectId: options.projectId },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      role: true,
      company: true,
      phone: true,
      email: true,
      website: true,
      ico: true,
      dic: true,
      notes: true,
      rating: true,
      _count: {
        select: {
          payments: true,
          timeEntries: true,
        },
      },
    },
  });

  const contacts: PdfContact[] = dbContacts.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    role: c.role,
    company: c.company,
    phone: c.phone,
    email: c.email,
    website: c.website,
    ico: c.ico,
    dic: c.dic,
    notes: c.notes,
    rating: c.rating,
    paymentCount: c._count?.payments ?? 0,
    timeEntryCount: c._count?.timeEntries ?? 0,
  }));

  // ─── 6.5) Load i18n translations for the target locale ──────────
  // PDF components run outside of React's context system, so they can't
  // use useTranslations(). We load all needed translations server-side
  // via getTranslations() and pass them as plain strings.
  const tPdf = await getTranslations({ locale: options.locale, namespace: "pdfReport" });
  const tPhases = await getTranslations({ locale: options.locale, namespace: "phases" });

  // Build phase translation map: raw DB value → localized phase name.
  const phaseTranslations: Record<string, string> = {};
  for (const phase of PHASES) {
    const phaseId = normalizePhase(phase);
    phaseTranslations[phase] = tPhases(phaseId);
    phaseTranslations[phase.toLowerCase()] = tPhases(phaseId);
  }

  // Build payment type translation map.
  const tPaymentTypes = await getTranslations({ locale: options.locale, namespace: "paymentTypes" });
  const paymentTypeTranslations: Record<string, string> = {};
  const paymentTypeKeys = ["receipt", "invoice", "work", "material", "person", "other"];
  for (const key of paymentTypeKeys) {
    paymentTypeTranslations[key] = tPaymentTypes(key);
  }

  // Build contact type translation map.
  const tContactTypes = await getTranslations({ locale: options.locale, namespace: "contactTypes" });
  const contactTypeTranslations: Record<string, string> = {};
  const contactTypeKeys = ["company", "craftsman", "self", "family", "supplier", "architect", "office"];
  for (const key of contactTypeKeys) {
    contactTypeTranslations[key] = tContactTypes(key);
  }

  const labels: PdfReportData["labels"] = {
    generated: tPdf("generated"),
    startDate: tPdf("startDate"),
    endDate: tPdf("endDate"),
    summary: tPdf("summary"),
    plan: tPdf("plan"),
    actual: tPdf("actual"),
    remaining: tPdf("remaining"),
    propertyInfo: tPdf("propertyInfo"),
    fullAddress: tPdf("fullAddress"),
    address: tPdf("address"),
    floorArea: tPdf("floorArea"),
    floors: tPdf("floors"),
    energyRating: tPdf("energyRating"),
    heatLoss: tPdf("heatLoss"),
    propertyNote: tPdf("propertyNote"),
    budgetItems: tPdf("budgetItems"),
    items: tPdf("items"),
    item: tPdf("item"),
    category: tPdf("category"),
    name: tPdf("name"),
    phase: tPdf("phase"),
    planCost: tPdf("planCost"),
    actualCost: tPdf("actualCost"),
    status: tPdf("status"),
    from: tPdf("from"),
    to: tPdf("to"),
    noItems: tPdf("noItems"),
    alerts: tPdf("alerts"),
    noAlerts: tPdf("noAlerts"),
    overdue: tPdf("overdue"),
    upcoming: tPdf("upcoming"),
    overBudget: tPdf("overBudget"),
    projection: tPdf("projection"),
    plannedBudget: tPdf("plannedBudget"),
    expectedTotalCosts: tPdf("expectedTotalCosts"),
    estimatedOverrun: tPdf("estimatedOverrun"),
    expectedSavings: tPdf("expectedSavings"),
    page: tPdf("page"),
    of: tPdf("of"),
    payments: tPdf("payments"),
    paymentsCount: tPdf("paymentsCount"),
    date: tPdf("date"),
    vendor: tPdf("vendor"),
    type: tPdf("type"),
    amount: tPdf("amount"),
    invoiceNumber: tPdf("invoiceNumber"),
    noPayments: tPdf("noPayments"),
    vatRate: tPdf("vatRate"),
    vatAmount: tPdf("vatAmount"),
    paymentType: tPdf("paymentType"),
    invoice: tPdf("invoice"),
    description: tPdf("description"),
    vatSummary: tPdf("vatSummary"),
    vatBase: tPdf("vatBase"),
    totalPayments: tPdf("totalPayments"),
    timeEntries: tPdf("timeEntries"),
    timeEntriesCount: tPdf("timeEntriesCount"),
    worker: tPdf("worker"),
    workerType: tPdf("workerType"),
    hours: tPdf("hours"),
    workerCount: tPdf("workerCount"),
    totalHours: tPdf("totalHours"),
    noTimeEntries: tPdf("noTimeEntries"),
    supplier: tPdf("supplier"),
    contacts: tPdf("contacts"),
    contactsCount: tPdf("contactsCount"),
    noContacts: tPdf("noContacts"),
    contactType: tPdf("contactType"),
    contactName: tPdf("contactName"),
    company: tPdf("company"),
    role: tPdf("role"),
    phone: tPdf("phone"),
    email: tPdf("email"),
    ico: tPdf("ico"),
    dic: tPdf("dic"),
    website: tPdf("website"),
    rating: tPdf("rating"),
    contactNotes: tPdf("contactNotes"),
    paymentCount: tPdf("paymentCount"),
    timeEntryCount: tPdf("timeEntryCount"),
    totalContacts: tPdf("totalContacts"),
  };

  // ─── 7) Assemble PdfReportData ───────────────────────────────────
  const data: PdfReportData = {
    project: {
      name: project.name,
      address: project.address,
      fullAddress: project.fullAddress,
      description: project.description,
      status: project.status,
      // Display currency = the target currency all amounts are now in.
      currency: targetCurrency,
      startDate: project.startDate,
      endDate: project.endDate,
      totalBudget: project.totalBudget,
      heatLoss: project.heatLoss,
      energyRating: project.energyRating,
      floorArea: project.floorArea,
      floors: project.floors,
      propertyNote: project.propertyNote,
    },
    budgetItems: convertedItems,
    totals: {
      planTotal,
      actualTotal,
      remaining,
      completedCount,
      itemCount,
      savedTotal,
      hoursTotal,
      projectedFinal,
      projectedOverrun,
    },
    alerts: { overdue, upcoming, overBudget },
    byPhase,
    payments,
    timeEntries,
    contacts,
    phaseTranslations,
    paymentTypeTranslations,
    contactTypeTranslations,
    labels,
  };

  // ─── 8) Render PDF to Buffer ─────────────────────────────────────
  // We use createElement (instead of JSX) because this is a .ts file,
  // not a .tsx file. The cast to ReactElement<any> is required because
  // createElement returns ReactElement<ReportDocumentProps> but
  const element = createElement(ReportDocument, { data, options });
  const buffer = await renderToBuffer(element as ReactElement<DocumentProps>);
  return buffer;
}

// =====================================================================
// generateFilename — produce a safe download filename
// ---------------------------------------------------------------------
// Strips diacritics + non-alphanumeric characters from the project name,
// truncates to 80 chars, and appends "_budget_YYYY-MM-DD.pdf".
// Falls back to "projekt" if the sanitized name is empty.
//
// NOTE: `locale` is part of the signature for future expansion (e.g.
// localizing the "budget" / "projekt" suffix). It is currently unused.
// =====================================================================

export function generateFilename(projectName: string, locale: string): string {
  const sanitize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "projekt";
  const today = new Date().toISOString().slice(0, 10);
  return `${sanitize(projectName)}_budget_${today}.pdf`;
}
