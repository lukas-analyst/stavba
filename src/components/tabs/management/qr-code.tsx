"use client";

// ============================================================
// QrCode — shareable QR code for the project's public URL
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx`. Behavior is unchanged.
//
// Generates a QR code as a data URL using the `qrcode` library.
// The QR encodes `${origin}/p/${projectSlug}` so scanning it opens
// the public read-only project view (or redirects to /auth/login
// if the project isn't public). Provides "Kopírovat odkaz" (copy
// URL) and "Stáhnout PNG" (download QR as PNG) action buttons.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

export type QrCodeProps = {
  projectSlug: string;
  projectName: string;
};

export function QrCode({ projectSlug, projectName }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const t = useTranslations("tabs.management.sharing.qr");

  // Generate QR code on mount / when projectSlug changes.
  // We compute the share URL inside the effect (not in render) because
  // `window.location.origin` is only available client-side and we don't
  // want SSR/client hydration mismatch. All setState calls happen inside
  // the async `.then()` callback to avoid the "synchronous setState in
  // effect" anti-pattern.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const url = `${origin}/p/${projectSlug}`;
    if (!canvasRef.current) {
      // Still set the URL so the "Kopírovat odkaz" button works.
      Promise.resolve().then(() => setShareUrl(url));
      return;
    }
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200,
      margin: 2,
      color: {
        dark: "#0a0a0a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then(() => {
        setShareUrl(url);
        // Also capture the data URL for the download button
        if (canvasRef.current) {
          setDataUrl(canvasRef.current.toDataURL("image/png"));
        }
      })
      .catch((err: unknown) => {
        console.error("QR generation failed:", err);
        toast.error(t("toasts.generateError"));
      });
  }, [projectSlug, t]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t("toasts.copySuccess"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("toasts.copyError"));
    }
  };

  const handleDownloadPng = () => {
    if (!dataUrl) {
      toast.error(t("toasts.qrNotReady"));
      return;
    }
    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project";
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("toasts.downloadSuccess"));
  };

  return (
    <>
      {/* QR code canvas — fixed 200×200 with rounded border */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-3 shadow-sm">
        <canvas ref={canvasRef} className="block h-[200px] w-[200px]" aria-label={t("aria", { name: projectName })} />
      </div>

      {/* Display the share URL (truncated) */}
      <div className="type-label-sm flex items-center gap-1.5 text-on-surface-variant">
        <Link2 className="h-3 w-3" />
        <span className="truncate max-w-[280px]">{shareUrl}</span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={handleCopyLink}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t("button.copyLinkCopied") : t("button.copyLink")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={handleDownloadPng}
          disabled={!dataUrl}
        >
          <Download className="h-3.5 w-3.5" />
          {t("button.downloadPng")}
        </Button>
      </div>
    </>
  );
}
