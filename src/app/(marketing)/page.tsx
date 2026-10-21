import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Camera, Sparkles, ShieldCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

export const metadata = { title: { absolute: "Vastra Studio · On-model photos without the photoshoot" } };

const steps = [
  { icon: Camera, title: "Photograph the piece", body: "Flat-lay, hanger or mannequin. Your phone is enough. We check the photo before you spend a credit." },
  { icon: Sparkles, title: "Choose your model", body: "Pick body type, skin tone and backdrop once. Every new piece gets the same house look in two taps." },
  { icon: ShieldCheck, title: "We check every image", body: "A quality gate rejects anything that would not pass for a studio photo, and refunds the credit." },
  { icon: Download, title: "Post it", body: "Download Instagram, story and print sizes. Every image carries a provenance mark." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-in">Start free</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-20">
          <div className="fade-up">
            <p className="eyebrow mb-5">For boutiques · suits, lehengas, sarees, western wear</p>
            <h1 className="display-xl text-ink">
              Every piece on a model.
              <br />
              <span className="text-ink-2">No photoshoot.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-ink-2">
              Upload the garment photo you already take. In about a minute you get a photoreal image of a model wearing it, ready for Instagram, WhatsApp and your catalogue.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  Try it with your next piece <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <span className="text-sm text-ink-2">Free credits to start · no card needed</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md fade-up [animation-delay:120ms]">
            <div className="grid grid-cols-[0.8fr_1fr] items-end gap-4">
              <figure className="image-frame aspect-[3/4] rotate-[-3deg] shadow-[var(--shadow-lg)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#e9b44c33,transparent_60%),linear-gradient(160deg,#efe8db,#e3d8c4)]" />
                <div className="absolute inset-x-6 bottom-6 top-10 rounded-[40%_40%_12px_12px] bg-[linear-gradient(180deg,#7a2c3a,#4a1821)] shadow-inner" />
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink-2">Your photo</figcaption>
              </figure>
              <figure className="image-frame aspect-[2/3] rotate-[2deg] shadow-[var(--shadow-lg)]">
                <Image src="/base-models/bm-regular-wheatish-20s.png" alt="Preview of a base model from the library" width={432} height={648} className="h-full w-full object-cover" priority />
                <div className="absolute inset-x-[31%] bottom-[12%] top-[22%] rounded-[30%_30%_14px_14px] bg-[linear-gradient(180deg,#7a2c3a,#4a1821)] opacity-95 mix-blend-multiply" />
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-on-accent">On model</figcaption>
              </figure>
            </div>
            <p className="mt-4 text-center text-xs text-ink-3">Illustrative preview. Library models are AI-generated and rights-clear.</p>
          </div>
        </section>

        <section className="border-y border-line bg-surface/60">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-lg">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <div className="card grid gap-8 p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="display-lg">Priced for every piece, not just the hero outfit.</h2>
              <p className="mt-3 max-w-xl leading-7 text-ink-2">
                A run of two variations is 25 credits. Buy credits in packs that work out cheaper than a single hour of a model&apos;s time, and never pay for an image that fails our quality check.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/sign-in">Open the studio</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-ink-3 sm:px-8">
          <span>© 2026 Vastra Studio. Generated images are synthetic and labelled as such.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
