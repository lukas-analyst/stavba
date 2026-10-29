"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// =====================================================================
// PasswordStrength — real-time password strength meter
// ---------------------------------------------------------------------
// Shows a colored bar + label that updates as the user types.
// Strength is computed from:
//   - Length (8+ = 1pt, 12+ = 2pt, 16+ = 3pt)
//   - Has lowercase + uppercase (1pt)
//   - Has digit (1pt)
//   - Has special char (1pt)
//
// Levels: 0-1 = weak (red), 2 = fair (amber), 3 = good (warning),
//         4-5 = strong (success)
// =====================================================================

type Strength = {
  score: number;        // 0-5
  level: "weak" | "fair" | "good" | "strong" | "empty";
  label: string;
  color: string;
  barColor: string;
  segments: number;     // how many of 4 segments are filled
};

function computeStrength(password: string, t: (key: string) => string): Strength {
  if (!password) {
    return { score: 0, level: "empty", label: "", color: "", barColor: "", segments: 0 };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  // Clamp to 0-4 segments
  const segments = Math.min(4, Math.max(0, score - 1));

  if (score <= 1) {
    return { score, level: "weak", label: t("weak"), color: "text-danger", barColor: "bg-danger", segments };
  }
  if (score === 2) {
    return { score, level: "fair", label: t("fair"), color: "text-warning", barColor: "bg-warning", segments };
  }
  if (score === 3) {
    return { score, level: "good", label: t("good"), color: "text-warning-strong", barColor: "bg-warning-strong", segments };
  }
  return { score, level: "strong", label: t("strong"), color: "text-success", barColor: "bg-success", segments: 4 };
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations("auth.validation.strength");
  const strength = useMemo(() => computeStrength(password, t), [password, t]);

  if (!password) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Strength bar — 4 segments */}
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              i < strength.segments ? strength.barColor : "bg-muted",
            )}
          />
        ))}
      </div>
      {/* Label */}
      <span className={cn("type-label font-medium tabular-nums shrink-0", strength.color)}>
        {strength.label}
      </span>
    </div>
  );
}
