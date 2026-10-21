import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getReel } from "@/lib/dal/reels";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/dal/audit";

/** Download a finished reel as an MP4 attachment. Authenticated, tenant-scoped. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx?.activeTenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const reel = await getReel(ctx.activeTenantId, id);
  if (!reel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!reel.outputKey) return NextResponse.json({ error: "This reel is not finished yet" }, { status: 409 });

  const video = await getStorage().get(reel.outputKey);
  const slug = (reel.garment.title || "vastra").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "vastra";
  await audit({ tenantId: ctx.activeTenantId, actorId: ctx.user.id, action: "reel.download", targetType: "reel", targetId: id });

  return new NextResponse(new Uint8Array(video), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(video.length),
      "Content-Disposition": `attachment; filename="${slug}-reel-${reel.vibe}.mp4"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
