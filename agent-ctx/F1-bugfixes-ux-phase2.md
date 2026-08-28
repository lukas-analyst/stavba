# Task F1 — Bug fixes + UX Phase 2

## Agent
Bug-fixes + UX Phase 2 subagent (Z.ai Code)

## Task
Opravit 4 bugy + implementovat Fázi 2 (UX vylepšení) v aplikaci Stavba.

## Bug fixes
1. **Smazání kontaktu → client-side error**: V `contacts-tab.tsx` přidán `onDelete` callback, který zavře `detailContact`/`editContact` dialogs PŘED React Query invalidací. Jinak by dialog renderoval smazaný kontakt a crashnul.
2. **Komentáře nejsou vidět**: `useComments` má teď `staleTime: 0` + `refetchOnMount: "always"`; `useCreateComment` onSuccess volá `removeQueries` + `invalidateQueries`. V `budget-item-dialog.tsx` přidán `<Separator>` + wrapper okolo `CommentSection`.
3. **Zavřený sidebar nejde otevřít**: Sidebar tlačítka dostala `z-50` (nad sticky header projektu, který má `z-40`). `<main>` dostává `md:pl-14` když je `desktopCollapsed`, takže header projektu nepřekrývá tlačítko.
4. **Scrollbar v tabech**: `<nav>` v `project-detail.tsx` používá `scrollbar-none` místo `scrollbar-thin`. V `globals.css` definována utility `.scrollbar-none` (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`).

## Phase 2 — UX
- **Loading skeletons**: Vylepšeny v `budget-tab`, `payments-tab`, `time-tab`, `timeline-tab`, `notes-tab` (toolbar + tabulka/card layout), dashboard už měl DashboardSkeleton.
- **error.tsx**: Route-level error boundary. AlertTriangle + "Něco se pokazilo" + "Zkusit znovu" (reset) + "Domů". Zobrazí `error.digest` pokud existuje.
- **loading.tsx**: Next.js loading UI. Loader2 spinner + "Načítám aplikaci…" na celé obrazovce.
- **not-found.tsx**: Vlastní 404. Velké "404" + "Stránka nenalezena" + tlačítko "Zpět na hlavní stránku" (`<Link href="/">`).
- **Meta tags**: V `layout.tsx` doplněno `applicationName`, `authors`, `icons` (logo.svg), `openGraph` (title/description/type/locale/siteName/images), `twitter` (card=summary), `robots`.
- **globals.css utility**: `.scrollbar-none` přidána.

## Lint
`bun run lint` — prošel bez chyb (0 problems).

## Files modified
- `src/components/tabs/contacts-tab.tsx`
- `src/lib/api.ts`
- `src/components/budget-item-dialog.tsx`
- `src/components/comment-section.tsx`
- `src/app/page.tsx`
- `src/components/project-detail.tsx`
- `src/app/globals.css`
- `src/components/tabs/budget-tab.tsx`
- `src/components/tabs/payments-tab.tsx`
- `src/components/tabs/time-tab.tsx`
- `src/components/tabs/timeline-tab.tsx`
- `src/components/tabs/notes-tab.tsx`
- `src/app/error.tsx` (nový)
- `src/app/loading.tsx` (nový)
- `src/app/not-found.tsx` (nový)
- `src/app/layout.tsx`
