import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/shell/wordmark";
import { SignInForm } from "./sign-in-form";
import { CompareSlider } from "@/components/marketing/compare-slider";
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
          <p className="mt-3 text-[0.95rem] leading-7 text-ink-2">We email you a six-digit code. No password to remember.</p>
          <div className="mt-8">
            <SignInForm googleEnabled={googleEnabled} />
          </div>
          <p className="mt-10 text-xs leading-5 text-ink-3">
            By continuing you agree to our <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy policy</Link>.
          </p>
        </div>
      </div>
      <div className="night relative hidden items-center justify-center p-12 lg:flex">
        <div className="w-full max-w-sm">
          <CompareSlider before="/samples/real-mannequin-coral-kurta.webp" after="/samples/reference-fashn-output-coral-kurta.webp" className="shadow-[var(--shadow-lg)]" />
          <p className="mt-6 font-display text-2xl font-bold leading-tight text-night-ink">The same suit, on a model, before the customer asks.</p>
          <p className="mt-2 text-sm text-night-ink-2">A real shop photo from a pilot boutique.</p>
        </div>
      </div>
    </div>
  );
}
