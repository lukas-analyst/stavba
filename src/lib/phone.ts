// ============================================================
// Phone utilities — formatting + country flag detection
// ------------------------------------------------------------
// Formats phone numbers with spaces every 3 digits for readability:
//   "+421777123456"  → "+421 777 123 456"
//   "+420777123456"  → "+420 777 123 456"
//   "+13325550144"   → "+1 332 555 0144"
//   "777123456"       → "777 123 456"
//
// Also detects the country flag emoji based on the calling code
// prefix, so the user immediately sees which country the number is from.
// ============================================================

// Country calling codes → ISO 3166-1 alpha-2 code (for flag emoji).
// Ordered by code length desc so we match the longest prefix first
// (e.g., "+1" before "+1-340" would be handled by US, but we don't
// need sub-territories here — main codes suffice).
const CALLING_CODE_TO_COUNTRY: { code: string; country: string; name: string }[] = [
  { code: "+420", country: "CZ", name: "Česko" },
  { code: "+421", country: "SK", name: "Slovensko" },
  { code: "+48", country: "PL", name: "Polsko" },
  { code: "+49", country: "DE", name: "Německo" },
  { code: "+43", country: "AT", name: "Rakousko" },
  { code: "+36", country: "HU", name: "Maďarsko" },
  { code: "+33", country: "FR", name: "Francie" },
  { code: "+39", country: "IT", name: "Itálie" },
  { code: "+34", country: "ES", name: "Španělsko" },
  { code: "+351", country: "PT", name: "Portugalsko" },
  { code: "+30", country: "GR", name: "Řecko" },
  { code: "+31", country: "NL", name: "Nizozemsko" },
  { code: "+32", country: "BE", name: "Belgie" },
  { code: "+45", country: "DK", name: "Dánsko" },
  { code: "+46", country: "SE", name: "Švédsko" },
  { code: "+47", country: "NO", name: "Norsko" },
  { code: "+358", country: "FI", name: "Finsko" },
  { code: "+354", country: "IS", name: "Island" },
  { code: "+352", country: "LU", name: "Lucembursko" },
  { code: "+353", country: "IE", name: "Irsko" },
  { code: "+44", country: "GB", name: "Velká Británie" },
  { code: "+353", country: "IE", name: "Irsko" },
  { code: "+1", country: "US", name: "USA / Kanada" },
  { code: "+7", country: "RU", name: "Rusko" },
  { code: "+380", country: "UA", name: "Ukrajina" },
  { code: "+370", country: "LT", name: "Litva" },
  { code: "+371", country: "LV", name: "Lotyšsko" },
  { code: "+372", country: "EE", name: "Estonsko" },
  { code: "+385", country: "HR", name: "Chorvatsko" },
  { code: "+386", country: "SI", name: "Slovinsko" },
  { code: "+381", country: "RS", name: "Srbsko" },
  { code: "+382", country: "ME", name: "Černá Hora" },
  { code: "+359", country: "BG", name: "Bulharsko" },
  { code: "+40", country: "RO", name: "Rumunsko" },
  { code: "+90", country: "TR", name: "Turecko" },
  { code: "+41", country: "CH", name: "Švýcarsko" },
];

type PhoneInfo = {
  formatted: string;
  flag: string; // emoji, empty string if unknown
  countryName: string; // empty string if unknown
  callingCode: string; // e.g. "+420", empty if not detected
};

// Convert ISO 3166-1 alpha-2 country code to flag emoji.
// Uses regional indicator symbols: each letter (A-Z) maps to a code
// point in the range U+1F1E6..U+1F1FF.
function countryToFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const cc = countryCode.toUpperCase();
  const codePoints = Array.from(cc).map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

// Find the calling code that matches the start of the phone number.
// Returns the first (longest) match.
function detectCallingCode(phone: string): { code: string; country: string; name: string } | null {
  const normalized = phone.trim();
  if (!normalized.startsWith("+")) return null;
  // Sort by code length desc to match longest prefix first
  const sorted = [...CALLING_CODE_TO_COUNTRY].sort((a, b) => b.code.length - a.code.length);
  for (const entry of sorted) {
    if (normalized.startsWith(entry.code)) {
      return entry;
    }
  }
  return null;
}

// Format a phone number with spaces every 3 digits.
// Examples:
//   "+421777123456"  → "+421 777 123 456"
//   "+420777123456"  → "+420 777 123 456"
//   "777123456"       → "777 123 456"
//   "+1234567890"     → "+1 234 567 890"
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";

  // Separate the +prefix from the rest
  let prefix = "";
  let rest = trimmed;

  if (trimmed.startsWith("+")) {
    // Extract the calling code (+XXX)
    const match = trimmed.match(/^(\+\d{1,4})(.*)$/);
    if (match) {
      prefix = match[1];
      rest = match[2];
    }
  }

  // Remove all non-digit characters from the rest
  const digits = rest.replace(/\D/g, "");

  // Group digits into chunks of 3
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }

  const formattedRest = groups.join(" ");
  return [prefix, formattedRest].filter(Boolean).join(" ");
}

// Get flag emoji + country info for a phone number.
// Returns empty strings if the calling code is not recognized.
export function getPhoneInfo(phone: string | null | undefined): PhoneInfo {
  const formatted = formatPhone(phone);
  if (!phone) {
    return { formatted, flag: "", countryName: "", callingCode: "" };
  }
  const detected = detectCallingCode(phone);
  if (!detected) {
    return { formatted, flag: "", countryName: "", callingCode: "" };
  }
  return {
    formatted,
    flag: countryToFlag(detected.country),
    countryName: detected.name,
    callingCode: detected.code,
  };
}
