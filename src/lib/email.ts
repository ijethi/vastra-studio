import "server-only";
import { env, isProd } from "@/env";

type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Transactional email. Uses Resend when a key is present; otherwise logs to
 * the server console (development only - never in production).
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (isProd) throw new Error("RESEND_API_KEY is required in production");
  // Development fallback: print the message so the code can be read from the terminal.
  console.log(`\n[mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
  // End-to-end tests read the latest code back through GET /api/dev/last-otp (same guard as that route).
  if (process.env.NODE_ENV !== "production" && process.env.E2E_TEST === "1") {
    globalThis.__vastraLastDevMail = { to: mail.to, subject: mail.subject, text: mail.text, sentAt: Date.now() };
  }
}

declare global {

  var __vastraLastDevMail: { to: string; subject: string; text: string; sentAt: number } | undefined;
}
