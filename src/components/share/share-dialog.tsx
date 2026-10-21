"use client";

import * as React from "react";
import { Check, Copy, Link2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Spinner } from "@/components/ui/primitives";
import { createShareLinkAction } from "@/app/actions/share";
import type { ShareTarget } from "@/lib/dal/share";

/**
 * Creates an expiring public link for a garment or one image and hands it to
 * WhatsApp, or copies it. Links last 30 days and can be revoked from settings.
 */
export function ShareLinkButton({ targetType, targetId, title, size = "sm", variant = "secondary", iconOnly = false }: { targetType: ShareTarget; targetId: string; title: string; size?: "sm" | "md" | "lg" | "icon"; variant?: "primary" | "secondary" | "ghost"; iconOnly?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function openDialog() {
    setOpen(true);
    if (url) return;
    setBusy(true);
    const res = await createShareLinkAction(targetType, targetId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setUrl(res.data.url);
  }

  const waHref = url ? `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}` : "#";

  return (
    <>
      <Button size={iconOnly ? "icon" : size} variant={variant} onClick={openDialog} aria-label={iconOnly ? "Share link" : undefined}>
        <Link2 className="h-4 w-4" aria-hidden="true" /> {iconOnly ? null : "Share link"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Share this look" description="Anyone with the link can see it for 30 days. Customers can message you on WhatsApp from the page.">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {busy || !url ? (
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner /> Making your link
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{url}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Button asChild size="lg" className="w-full bg-[#25D366] text-white hover:bg-[#1fb857]">
                <a href={waHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" aria-hidden="true" /> Send on WhatsApp
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
