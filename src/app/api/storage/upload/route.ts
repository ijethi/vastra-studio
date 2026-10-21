import { NextResponse, type NextRequest } from "next/server";
import { LocalStorage, verifyLocalToken } from "@/lib/storage/local";
import { env } from "@/env";

/**
 * Local-storage upload target (development / single box). The HMAC token
 * binds the key, content type, size cap and expiry, mirroring an S3
 * presigned PUT. In S3 mode the browser uploads to S3 directly and this
 * route is never used.
 */
export async function PUT(req: NextRequest) {
  if (env.STORAGE_DRIVER !== "local") return NextResponse.json({ error: "Not available" }, { status: 404 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyLocalToken(token, "w");
  if (!payload) return NextResponse.json({ error: "Invalid or expired upload URL" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  if (payload.ct && contentType.split(";")[0].trim() !== payload.ct) {
    return NextResponse.json({ error: "Content type mismatch" }, { status: 400 });
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  const max = payload.mb ?? 0;
  if (max && declared > max) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const body = Buffer.from(await req.arrayBuffer());
  if (max && body.length > max) return NextResponse.json({ error: "File too large" }, { status: 413 });

  await new LocalStorage().put(payload.k, body);
  return new NextResponse(null, { status: 204 });
}
