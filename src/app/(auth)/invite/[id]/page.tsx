import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/auth";
import { Wordmark } from "@/components/shell/wordmark";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

async function Accept({ id }: { id: string }) {
  await requireUser();
  const auth = await getAuth();
  try {
    const result = await auth.api.acceptInvitation({ headers: await headers(), body: { invitationId: id } });
    if (result?.invitation?.organizationId) {
      await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId: result.invitation.organizationId } });
    }
  } catch (err) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" title="This invitation could not be accepted">
          {(err as Error).message || "It may have expired or been sent to a different email address."}
        </Alert>
        <Button asChild variant="secondary">
          <Link href="/studio">Go to the studio</Link>
        </Button>
      </div>
    );
  }
  redirect("/studio");
}

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center py-12">
        <h1 className="display-lg">Joining the boutique…</h1>
        <div className="mt-6">
          <Suspense fallback={<Skeleton className="h-16" />}>
            <Accept id={id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
