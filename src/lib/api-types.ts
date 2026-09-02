// Shared API types — extracted here so they can be imported from both
// the React client (api.ts) and server-side cache modules without
// circular dependencies.

export type AlertItem = {
  id: string;
  category: string;
  subcategory: string | null;
  phase: string;
  planCost: number | null;
  actualCost: number;
  actualHours: number;
  dateFrom: string | null;
  dateTo: string | null;
  completed: boolean;
  rejected: boolean;
  required: boolean;
};

// Project shape returned in the dashboard response (subset of full Project).
export type DashboardProject = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  starred: boolean;
  status: string;
  startDate: string | null;
  endDate: string | null;
};

export type DashboardData = {
  project: DashboardProject;
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
    completedCount: number;
    savedTotal: number;
    projectedFinal: number;
    projectedOverrun: number;
    avgOverrunRatio: number;
  };
  byPhase: {
    phase: string;
    plan: number;
    actual: number;
    hours: number;
    plannedHours: number;
    count: number;
    completedCount: number;
    worstCase: number;
    costOverrun: number;
    timeOverrun: number;
    inProgress: boolean;
    startingSoon: boolean;
  }[];
  byCategory: { category: string; plan: number; actual: number; hours: number; count: number }[];
  alerts: {
    inProgress: AlertItem[];
    upcoming: AlertItem[];
    overdue: AlertItem[];
    overBudget: AlertItem[];
    unscheduled: AlertItem[];
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
    completed: boolean;
    rejected: boolean;
  }[];
  recent: {
    payments: {
      id: string;
      amount: number;
      date: string;
      type: string;
      vendor: string | null;
      description: string | null;
      invoiceNumber: string | null;
      budgetItem: { category: string; subcategory: string | null };
      contact: { name: string } | null;
    }[];
    timeEntries: {
      id: string;
      workerName: string;
      workerType: string;
      date: string;
      hours: number;
      description: string | null;
      budgetItem: { category: string; subcategory: string | null };
    }[];
  };
};
