import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { VERSION_LABEL } from "@/generated/version";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_TITLE = `Rozpočet Stavby ${VERSION_LABEL}`;
const APP_DESCRIPTION =
  "Komplexní správa rozpočtu, nákladů a času pro stavby a rekonstrukce. Přehled projektů, plateb, práce i materiálu na jednom místě.";

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  applicationName: "Rozpočet Stavby",
  keywords: [
    "stavba",
    "rekonstrukce",
    "rozpočet",
    "náklady",
    "projekt",
    "správa",
  ],
  authors: [{ name: "Stavba" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon.svg"],
    apple: ["/favicon.svg"],
  },
  openGraph: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    type: "website",
    locale: "cs_CZ",
    siteName: "Rozpočet Stavby",
    images: [
      {
        url: "/logo.svg",
        width: 256,
        height: 256,
        alt: "Stavba",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    images: ["/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Next.js 14+ requires `themeColor` (and other viewport-related metadata)
// to be exported separately from the `metadata` export. The light color
// `#f7f9fc` matches the subtle blue-tinted app background
// (oklch(0.99 0.006 250) ≈ #f7f9fc) so the browser chrome (mobile address
// bar on iOS Safari, PWA window controls, etc.) blends with the page.
// The dark color `#0a0a0a` matches the dark-mode background.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
        <SonnerToaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
