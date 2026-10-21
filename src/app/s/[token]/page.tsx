import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { resolveShareToken, getBoutiqueContact } from "@/lib/dal/share";
import { getDb, schema } from "@/lib/db";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { listImagesForGarment } from "@/lib/dal/jobs";
import { Wordmark } from "@/components/shell/wordmark";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Shared look", robots: { index: false, follow: false } };

/** Public page behind an expiring share link. Shows only what the boutique chose to share. */
async function Shared({ token }: { token: string }) {
  const link = await resolveShareToken(token);
  if (!link) notFound();
  const db = await getDb();
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, link.tenantId) });
  if (!org) notFound();
  const contact = await getBoutiqueContact(link.tenantId);
  const storage = getStorage();

  let title = "";
  let images: Array<{ id: string; url: string; width: number; height: number }> = [];
  if (link.targetType === "image") {
    const img = await db.query.generatedImages.findFirst({ where: eq(schema.generatedImages.id, link.targetId), with: { garment: true } });
    if (!img || img.tenantId !== link.tenantId) notFound();
    title = img.garment.title;
    images = [{ id: img.id, url: await storage.signRead(img.storageKey, READ_URL_TTL_SECONDS), width: img.width, height: img.height }];
  } else {
    const garment = await db.query.garments.findFirst({ where: eq(schema.garments.id, link.targetId) });
    if (!garment || garment.tenantId !== link.tenantId || garment.deletedAt) notFound();
    title = garment.title;
    const all = await listImagesForGarment(link.tenantId, garment.id);
    const chosen = all.filter((i) => i.accepted);
    const list = chosen.length ? chosen : all.slice(0, 4);
    images = await Promise.all(list.map(async (i) => ({ id: i.id, url: await storage.signRead(i.storageKey, READ_URL_TTL_SECONDS), width: i.width, height: i.height })));
  }

  const waText = encodeURIComponent(`Hi ${org.name}, I am interested in "${title}" that I saw on your Vastra link.`);
  const waHref = contact.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}?text=${waText}` : null;

  return (
    <>
      <header className="mb-8 text-center">
        <p className="eyebrow mb-2">{org.name}</p>
        <h1 className="display-lg">{title}</h1>
      </header>
      <ul className={images.length === 1 ? "mx-auto max-w-sm" : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
        {images.map((img, i) => (
          <li key={img.id} className="image-frame aspect-[2/3] shadow-[var(--shadow)]">
            <Image src={img.url} alt={`${title}, look ${i + 1}`} width={img.width} height={img.height} unoptimized className="h-full w-full object-cover" priority={i === 0} />
          </li>
        ))}
      </ul>
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-8 flex h-13 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 font-semibold text-white shadow-[var(--shadow)] hover:brightness-95"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Ask on WhatsApp
        </a>
      ) : null}
      <p className="mt-10 text-center text-xs text-ink-3">Images made with the help of AI. The garment is as photographed by the boutique.</p>
    </>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6">
      <Link href="/" className="inline-block self-start">
        <Wordmark />
      </Link>
      <main className="flex-1 py-8">
        <Suspense
          fallback={
            <div className="space-y-6">
              <Skeleton className="mx-auto h-9 w-56" />
              <Skeleton className="mx-auto aspect-[2/3] max-w-sm" />
            </div>
          }
        >
          <Shared token={token} />
        </Suspense>
      </main>
    </div>
  );
}
