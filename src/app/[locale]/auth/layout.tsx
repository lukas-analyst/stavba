"use client";

import { LanguageSwitcher } from "@/components/language-switcher";

// =====================================================================
// Auth layout — adds a language switcher to the top-right corner of
// all auth pages (login, register, forgot-password, etc.).
//
// The switcher is fixed positioned so it doesn't interfere with the
// page content. It uses the same LanguageSwitcher component as TopBar
// (flag icon + dropdown).
// =====================================================================

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Language switcher — top-right corner, fixed position */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      {children}
    </>
  );
}
