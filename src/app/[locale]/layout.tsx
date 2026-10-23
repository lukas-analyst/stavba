import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { VERSION_LABEL } from "@/generated/version";
import { locales, LOCALE_META, defaultLocale, type Locale } from "@/i18n/config";
import "../globals.css";

// Preload fonts (avoid FOIT — Next.js handles subset inlining automatically).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// =====================================================================
// Static route segment config
// ---------------------------------------------------------------------
// `generateStaticParams` pre-generates the supported locale segments at
// build time so `/cs/` and `/en/` are statically rendered (faster TTFB).
// The default locale (`cs`) does NOT get a URL prefix thanks to
// `as-needed` routing, but Next.js still needs the segment to exist.
// =====================================================================

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// =====================================================================
// Metadata — locale-aware
// ---------------------------------------------------------------------
// `title` and `description` are translated per-locale so English users see
// English metadata in the browser tab + social share previews.
// `openGraph.locale` is set to the BCP-47 tag (cs_CZ / en_GB).
// =====================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });

  const appName = t("appName");
  const title = `${appName} ${VERSION_LABEL}`;
  const description = t("description");

  return {
    title,
    description,
    applicationName: appName,
    keywords: t.raw("keywords") as string[],
    authors: [{ name: appName }],
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: ["/favicon.svg"],
      apple: ["/favicon.svg"],
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: LOCALE_META[locale as Locale]?.bcp47 ?? LOCALE_META[defaultLocale].bcp47,
      siteName: appName,
      images: [
        {
          url: "/logo.svg",
          width: 256,
          height: 256,
          alt: appName,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/logo.svg"],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// Next.js viewport metadata (theme color matches app background).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

// =====================================================================
// LocaleLayout — wraps the app with the NextIntlClientProvider so that
// `useTranslations()` / `useLocale()` work in client components.
// ---------------------------------------------------------------------
// `setRequestLocale` is called so server components / APIs in this
// request tree inherit the resolved locale (used by `getTranslations()`
// without explicitly passing locale each time).
// =====================================================================

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate the locale — if it's not in our supported list, render 404.
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Make the locale available to server components for this request.
  setRequestLocale(locale as Locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
