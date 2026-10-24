import { PublicProviders } from "@/components/public-providers";
import { detectLocaleFromRequest } from "@/i18n/detect";

// =====================================================================
// Layout for invitation accept pages (`/invite/[token]`)
// ---------------------------------------------------------------------
// Same pattern as `/p/[slug]/layout.tsx` — shared URLs without a
// `[locale]` segment. Detects locale from cookie + Accept-Language
// and wraps the page in `<PublicProviders>`.
// =====================================================================

export default async function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await detectLocaleFromRequest();
  const messages = (await import(`@/messages/${locale}.json`)).default;

  return (
    <PublicProviders locale={locale} messages={messages}>
      {children}
    </PublicProviders>
  );
}
