import { NextResponse } from "next/server";
import { requestUploadUrl } from "@/app/actions/garments";

/** REST mirror of the upload action for the future mobile app. */
export async function POST(req: Request) {
  let body: { contentType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await requestUploadUrl({ contentType: String(body.contentType ?? ""), size: Number(body.size ?? 0) });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
