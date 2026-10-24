import { PublicProviders } from "@/components/public-providers";
import { detectLocaleFromRequest } from "@/i18n/detect";

// =====================================================================
// Layout for public project pages (`/p/[slug]`)
// ---------------------------------------------------------------------
// These pages are shared URLs (QR codes, e-mail links) so they do NOT
// have a `[locale]` URL segment. Instead, this layout detects the
// locale from the `NEXT_LOCALE` cookie + `Accept-Language` header and
// wraps the page tree in `<PublicProviders>` (NextIntl + Session).
//
// The URL stays clean (`/p/slug`) regardless of the rendered language.
// =====================================================================

export default async function PublicProjectLayout({
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
