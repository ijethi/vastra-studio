import { NextResponse, type NextRequest } from "next/server";
import { LocalStorage, verifyLocalToken } from "@/lib/storage/local";
import { ASSET_CACHE_CONTROL } from "@/lib/storage/types";
import { env } from "@/env";

function contentTypeFor(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".mp4")) return "video/mp4";
  return "image/jpeg";
}

/**
 * Serve a private local object through a signed, expiring URL. Honours a
 * single byte range so the browser's video player can seek and the reel
 * starts before the whole file has arrived.
 */
export async function GET(req: NextRequest) {
  if (env.STORAGE_DRIVER !== "local") return NextResponse.json({ error: "Not available" }, { status: 404 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyLocalToken(token, "r");
  if (!payload) return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  let body: Buffer;
  try {
    body = await new LocalStorage().get(payload.k);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(payload.k),
    "Cache-Control": ASSET_CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
  };

  const range = req.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && (match[1] || match[2])) {
    const size = body.length;
    // "bytes=a-b", "bytes=a-" or the suffix form "bytes=-n".
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = Math.min(match[1] && match[2] ? Number(match[2]) : size - 1, size - 1);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const chunk = body.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(chunk.length) },
    });
  }

  return new NextResponse(new Uint8Array(body), { headers: { ...headers, "Content-Length": String(body.length) } });
}
