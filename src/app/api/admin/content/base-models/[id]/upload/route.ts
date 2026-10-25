import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import sharp from "sharp";
import { getSessionContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getStorage, keys, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { readBackdropRows, readBaseModelRows, setBaseModelImage } from "@/lib/content/store";
import { CONTENT_TAG, invalidateContentMemo } from "@/lib/dal/content";
import { audit } from "@/lib/dal/audit";
import { log } from "@/lib/log";

/**
 * Platform admin: upload a reviewed render for a base model.
 *
 *   POST multipart/form-data  file=<image>  [backdrop=<backdrop id>]
 *
 * Without `backdrop` the image becomes the model's preview (what the studio
 * and settings pages show). With `backdrop` it becomes the photoreal render
 * the pipeline composites on for that backdrop (`library/<model>/<backdrop>.jpg`),
 * the same key the library script writes. Images are re-encoded (EXIF
 * stripped, capped size) before they are stored.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx?.isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(id)) return NextResponse.json({ error: "Bad model id" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  const backdrop = String(form.get("backdrop") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File too large (15 MB max)" }, { status: 413 });

  const db = await getDb();
  const model = (await readBaseModelRows(db)).find((r) => r.id === id);
  if (!model) return NextResponse.json({ error: "Unknown model" }, { status: 404 });
  if (backdrop && !(await readBackdropRows(db)).some((b) => b.id === backdrop)) return NextResponse.json({ error: "Unknown backdrop" }, { status: 400 });

  const raw = Buffer.from(await file.arrayBuffer());
  let out: Buffer;
  let width: number;
  let height: number;
  try {
    const image = sharp(raw, { limitInputPixels: 40_000_000 }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new Error("not an image");
    const target = backdrop ? { w: 1536, h: 2304 } : { w: 540, h: 810 };
    out = await image.resize(target.w, target.h, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const m = await sharp(out).metadata();
    width = m.width ?? target.w;
    height = m.height ?? target.h;
  } catch {
    return NextResponse.json({ error: "Please upload a JPEG, PNG or WebP image" }, { status: 400 });
  }

  const key = backdrop ? keys.libraryRender(id, backdrop) : keys.libraryPreview(id);
  await getStorage().put(key, out, "image/jpeg");
  if (!backdrop) await setBaseModelImage(db, id, key, { width, height });

  await audit({ tenantId: null, actorId: ctx.user.id, action: backdrop ? "content.base_model.render.upload" : "content.base_model.preview.upload", targetType: "base_model", targetId: id, metadata: { key, bytes: out.length, backdrop: backdrop || null } });
  invalidateContentMemo();
  // Route handlers use revalidateTag (updateTag is for Server Actions only).
  revalidateTag(CONTENT_TAG, "max");
  log.info("content.base_model.upload", { modelId: id, key, backdrop: backdrop || null, actorId: ctx.user.id });
  return NextResponse.json({ ok: true, key, width, height });
}
