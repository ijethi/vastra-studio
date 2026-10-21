import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/shell/wordmark";
import { SignInForm } from "./sign-in-form";
import { env } from "@/env";
import { getSessionContext } from "@/lib/auth/session";

export const metadata = { title: "Sign in" };

async function RedirectIfSignedIn() {
  const ctx = await getSessionContext();
  if (ctx) redirect("/studio");
  return null;
}

export default function SignInPage() {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="inline-block self-start">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12 fade-up">
          <h1 className="display-lg">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-ink-2">We will email you a six-digit code. No password to remember.</p>
          <div className="mt-8">
            <SignInForm googleEnabled={googleEnabled} />
          </div>
          <p className="mt-10 text-xs leading-5 text-ink-3">
            By continuing you agree to our <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy policy</Link>.
          </p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-surface-2 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,#e9b44c2e,transparent_55%),radial-gradient(ellipse_at_20%_80%,#c2561e22,transparent_55%)]" />
        <blockquote className="absolute bottom-14 left-14 right-14 max-w-md">
          <p className="font-display text-3xl leading-tight text-ink">“Customers stopped asking how it falls. They could see it.”</p>
          <footer className="mt-4 text-sm text-ink-2">Pilot boutique owner, Jaipur</footer>
        </blockquote>
      </div>
    </div>
  );
}
