"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";

// =====================================================================
// React Query client configuration
// ---------------------------------------------------------------------
// staleTime: how long data is considered fresh (no refetch on focus/mount)
// gcTime:    how long data stays in cache after no components use it
//
// Tuning strategy:
//   - Default staleTime: 30s — balances freshness vs API load
//   - Dashboard: 60s (heavy aggregation, cached server-side too)
//   - Budget/Payments/Time/Contacts: 15s (user expects fresh data here)
//   - Projects list: 60s (rarely changes)
//   - Spending trend: 5min (historical data, rarely changes)
// =====================================================================

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds default
            gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
