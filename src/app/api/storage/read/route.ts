import { NextResponse, type NextRequest } from "next/server";
import { LocalStorage, verifyLocalToken } from "@/lib/storage/local";
import { env } from "@/env";

/** Serve a private local object through a signed, expiring URL. */
export async function GET(req: NextRequest) {
  if (env.STORAGE_DRIVER !== "local") return NextResponse.json({ error: "Not available" }, { status: 404 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyLocalToken(token, "r");
  if (!payload) return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  try {
    const body = await new LocalStorage().get(payload.k);
    const type = payload.k.endsWith(".png") ? "image/png" : "image/jpeg";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
