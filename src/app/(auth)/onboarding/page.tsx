import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Wordmark } from "@/components/shell/wordmark";
import { OnboardingForm } from "./onboarding-form";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Set up your boutique" };

async function Gate() {
  const ctx = await requireUser();
  const db = await getDb();
  const existing = await db.query.member.findFirst({ where: eq(schema.member.userId, ctx.user.id) });
  if (existing) redirect("/studio");
  return <OnboardingForm defaultName={ctx.user.name && ctx.user.name !== ctx.user.email ? `${ctx.user.name}'s boutique` : ""} />;
}

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center py-12 fade-up">
        <p className="eyebrow mb-3">One last step</p>
        <h1 className="display-lg">Name your boutique</h1>
        <p className="mt-2 text-sm leading-6 text-ink-2">This is the name your team sees, and the watermark on trial images. You can change it later.</p>
        <div className="mt-8">
          <Suspense fallback={<Skeleton className="h-28" />}>
            <Gate />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
