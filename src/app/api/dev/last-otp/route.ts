import { NextResponse, type NextRequest } from "next/server";
import { isProd } from "@/env";

/**
 * Development-only helper for end-to-end tests: returns the most recent
 * sign-in code that the console mail fallback captured for an address.
 *
 * Guard: 404 unless NODE_ENV is not production AND E2E_TEST=1. The literal
 * `process.env.NODE_ENV` check lets the compiler strip the body from
 * production builds entirely; `isProd` covers the validated runtime env.
 */
function enabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (isProd) return false;
  return process.env.E2E_TEST === "1";
}

export async function GET(req: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";
  const mail = globalThis.__vastraLastDevMail;
  if (!email || !mail || mail.to.toLowerCase() !== email) {
    return NextResponse.json({ error: "No code captured for that address yet" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
  if (!code) return NextResponse.json({ error: "No code captured for that address yet" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  return NextResponse.json({ email, code, sentAt: mail.sentAt }, { headers: { "Cache-Control": "no-store" } });
}
