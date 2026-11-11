# Error Codes & Log Management

> **Verze:** 1.0.0-beta
> **Poslední aktualizace:** 10. listopadu 2026

---

## 1. Log formát

### API routes
```typescript
console.error(`${logPrefix} error:`, errorObj.message, errorObj.stack ?? "");
```

**Formát:** `[module] HTTP_METHOD /api/path error: <message> <stack>`

**Příklad:**
```
[budget] GET /api/projects/[id]/budget error: Connection terminated unexpectedly
```

### Route error boundaries (error.tsx)
```typescript
console.error("[error-reporting]", payload);
```

**Payload obsahuje:**
- `message` — chybová zpráva (PII redacted)
- `stack` — stack trace (PII redacted)
- `context` — dodatečný kontext (source, digest, ...)
- `timestamp` — ISO 8601
- `environment` — `production` / `development`

---

## 2. PII redaction

Následující patterny jsou automaticky maskovány před logováním/webhookem:

| Pattern | Příklad | Redacted |
|---------|---------|----------|
| `"password":"..."` | `"password":"secret123"` | `"password":"***"` |
| `"token":"..."` | `"token":"abc64hex..."` | `"token":"***"` |
| `"passwordResetToken":"..."` | `"passwordResetToken":"abc..."` | `"passwordResetToken":"***"` |
| `"emailVerifyToken":"..."` | `"emailVerifyToken":"abc..."` | `"emailVerifyToken":"***"` |
| `Authorization: Bearer ...` | `Authorization: Bearer eyJ...` | `Authorization: Bearer ***` |
| `next-auth.session-token=...` | `next-auth.session-token=eyJ...` | `next-auth.session-token=***` |

**Implementace:** `src/lib/error-reporting.ts` — `redactPii()` + `redactError()`

---

## 3. Webhook integration

### Konfigurace
Nastavte `ERROR_REPORTING_WEBHOOK_URL` v Vercel dashboard pro přijímání error reportů.

### Podporované služby
- Sentry (kompatibilní JSON payload)
- Slack incoming webhook
- Discord webhook
- Custom endpoint

### Payload
```json
{
  "module": "budget",
  "route": "GET /api/projects/[id]/budget",
  "message": "Connection terminated unexpectedly",
  "stack": "...",
  "context": {},
  "timestamp": "2026-11-10T12:00:00.000Z",
  "environment": "production"
}
```

### Fire-and-forget
Webhook se volá asynchronně — nikdy neblokuje API response. Chyby webhooku se ignorují.

---

## 4. Error kódy (machine-readable)

Následující API endpointy vrací `code` pole pro programmatic handling:

| Endpoint | Kód | HTTP Status | Význam |
|----------|-----|-------------|--------|
| `POST /api/auth/reset-password` | `TOKEN_EXPIRED` | 400 | Reset token vypršel (14 dní) |
| `POST /api/auth/reset-password` | `TOKEN_USED` | 400 | Token už byl použit |
| `POST /api/auth/reset-password` | `TOKEN_INVALID` | 400 | Token neexistuje / neplatný formát |

### Klientské zpracování
```typescript
const code = data.code as string | undefined;
if (code === "TOKEN_EXPIRED" || code === "TOKEN_USED" || code === "TOKEN_INVALID") {
  setError(data.error);
  setTokenState("invalid");
}
```

---

## 5. Uživatelské chybové zprávy

### Validace chyby (400)
Lokalizované, specifické zprávy. Příklad:
- `"E-mail a heslo jsou povinné."` — jasný pokyn, co chybí
- `"Neplatný formát e-mailu."` — jasný pokyn, co opravit

### Systémové chyby (500)
Všechny 500-type chyby obsahují actionable pokyn `"Zkuste to prosím znovu."` (nebo ekvivalent v daném jazyce).

**Pattern:**
```
<Co selhalo>. Zkuste to prosím znovu.
```

**Příklady:**
- `"Vytvoření položky rozpočtu selhalo. Zkuste to prosím znovu."`
- `"Načtení plateb selhalo. Zkuste to prosím znovu."`
- `"Přidání člena selhalo. Zkuste to prosím znovu."`

### Rate limit (429)
```json
{
  "error": "Příliš mnoho pokusů. Zkuste to znovu za 45 minut."
}
```
Hlavička `Retry-After` obsahuje počet sekund do dalšího pokusu.

---

## 6. Log helpery

### `reportError(error, context?)`
Pro route error boundaries (`error.tsx`, `global-error.tsx`).

```typescript
import { reportError } from "@/lib/error-reporting";

// V error.tsx
reportError(error, { digest: error.digest, source: "route-error-boundary" });
```

### `logApiError(module, route, error, context?)`
Pro API route catch bloky.

```typescript
import { logApiError } from "@/lib/error-reporting";

// V API route
} catch (error) {
  logApiError("budget", "GET /api/projects/[id]/budget", error);
  return NextResponse.json(
    { error: t("budget.fetchFailed") },
    { status: 500 },
  );
}
```

**Výhody:**
- Konzistentní log formát `[module] route error:`
- PII automaticky redacted
- Webhook odeslán (pokud nakonfigurován)
- Nestackuje se s `console.error` — volá se jednou

---

## 7. Audit logování

Klíčové akce (create, update, delete) jsou logovány přes `logChanges()` do `AuditLog` tabulky.

**Záznam obsahuje:**
- `userId` — kdo provedl akci
- `projectId` — na jakém projektu
- `model` — jaký model (BudgetItem, Payment, ...)
- `recordId` — který záznam
- `action` — `create` | `update` | `delete`
- `before` — JSON před změnou
- `after` — JSON po změně

**Příklad:**
```typescript
await logChanges(id, "BudgetItem", itemId, "update", { completed: false }, { completed: true });
```

**Dostupné přes:** `GET /api/projects/[id]/audit` (viewer+ role)
