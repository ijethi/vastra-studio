import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getImage } from "@/lib/dal/jobs";
import { getStorage } from "@/lib/storage";
import { renderForDownload, type DownloadSize } from "@/lib/images";
import { audit } from "@/lib/dal/audit";

const SIZES: Record<DownloadSize, string> = { original: "original", "ig-portrait": "1080x1350", story: "1080x1920", print: "print-2x" };

/** Download a generated image at a chosen size. Authenticated, tenant-scoped. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx?.activeTenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const size = (req.nextUrl.searchParams.get("size") ?? "original") as DownloadSize;
  if (!(size in SIZES)) return NextResponse.json({ error: "Unknown size" }, { status: 400 });

  const image = await getImage(ctx.activeTenantId, id);
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const source = await getStorage().get(image.storageKey);
  const out = await renderForDownload(source, size);
  const slug = (image.garment.title || "vastra").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "vastra";
  await audit({ tenantId: ctx.activeTenantId, actorId: ctx.user.id, action: "image.download", targetType: "image", targetId: id, metadata: { size } });

  return new NextResponse(new Uint8Array(out), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${slug}-${SIZES[size]}.jpg"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
