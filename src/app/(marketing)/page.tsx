import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Camera, Check, Clapperboard, MessageCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";
import { CompareSlider } from "@/components/marketing/compare-slider";
import { Faq } from "@/components/marketing/faq";
import { getAppContent, getCreditPacks } from "@/lib/dal/content";
import { creditsForRun } from "@/lib/dal/pricing";

export const metadata = { title: { absolute: "Vastra Studio · Your suit, on a model, in a minute" } };

const BEFORE = "/samples/real-mannequin-coral-kurta.webp";
const AFTER = "/samples/reference-on-model-coral-kurta.webp";

export default async function LandingPage() {
  const runCredits = creditsForRun(2);
  const [hero, pricing, garmentCopy, packs] = await Promise.all([getAppContent("landing.hero"), getAppContent("landing.pricing"), getAppContent("landing.garments"), getCreditPacks()]);
  const activePacks = packs;
  const featured = Math.min(1, Math.max(0, activePacks.length - 1));
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link href="#how" className="hidden px-3 text-sm font-semibold text-ink-2 hover:text-ink sm:block">
              How it works
            </Link>
            <Link href="#pricing" className="hidden px-3 text-sm font-semibold text-ink-2 hover:text-ink sm:block">
              Pricing
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-in">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <section className="wash">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pb-24 lg:pt-20">
          <div className="fade-up">
            <p className="eyebrow mb-5">{hero.eyebrow}</p>
            <h1 className="display-xl text-ink">
              {hero.lines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-ink-2">{hero.subtitle}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  {hero.primaryCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="#how">{hero.secondaryCta}</Link>
              </Button>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
              {hero.bullets.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-teal" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-[340px] fade-up [animation-delay:150ms]">
            <div className="phone float-slow">
              <div className="phone-screen">
                <div className="flex items-center justify-between px-5 pb-2 pt-4">
                  <Wordmark />
                  <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-ink">Credits 75</span>
                </div>
                <div className="px-4 pb-4">
                  <CompareSlider before={BEFORE} after={AFTER} className="rounded-[18px]" />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <span className="rounded-full bg-accent px-3 py-2 text-center text-xs font-bold text-on-accent">Share</span>
                    <span className="rounded-full border border-line-strong px-3 py-2 text-center text-xs font-bold text-ink">Save</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-ink-3">A real shop photo from a pilot boutique. Drag the handle.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- bento */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">What you get</p>
          <h2 className="display-lg">Everything a listing needs, from one photo.</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          <div className="card overflow-hidden md:col-span-4">
            <div className="grid gap-6 p-6 sm:grid-cols-[1fr_200px] sm:p-8">
              <div>
                <ShieldCheck className="mb-4 h-6 w-6 text-teal" aria-hidden="true" />
                <h3 className="text-xl">The same suit, guaranteed.</h3>
                <p className="mt-2 text-[0.95rem] leading-7 text-ink-2">
                  Mannequin photos keep your garment&apos;s own pixels. Every result is compared with your photo for colour, print and embroidery. If it drifts, it is thrown away and the credits come back.
                </p>
              </div>
              <div className="image-frame aspect-[3/4] self-center">
                <Image src={AFTER} alt="The coral kurta on a model" fill sizes="200px" className="object-cover" />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-bold text-teal">
                  <Check className="h-3 w-3" aria-hidden="true" /> Exact match
                </span>
              </div>
            </div>
          </div>
          <div className="tile p-6 sm:p-8 md:col-span-2">
            <Clapperboard className="mb-4 h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="text-xl">Reels, too.</h3>
            <p className="mt-2 text-[0.95rem] leading-7 text-ink-2">Nine scenes of your model in your piece, animated into a vertical video with your name at the end.</p>
          </div>
          <div className="tile p-6 sm:p-8 md:col-span-2">
            <MessageCircle className="mb-4 h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="text-xl">Straight to WhatsApp.</h3>
            <p className="mt-2 text-[0.95rem] leading-7 text-ink-2">Share in one tap, or send a link where customers can message you about the piece.</p>
          </div>
          <div className="tile p-6 sm:p-8 md:col-span-2">
            <Users className="mb-4 h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="text-xl">Your whole team.</h3>
            <p className="mt-2 text-[0.95rem] leading-7 text-ink-2">Staff add photos and make images. Only you see billing.</p>
          </div>
          <div className="tile p-6 sm:p-8 md:col-span-2">
            <Sparkles className="mb-4 h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="text-xl">One tap. No settings.</h3>
            <p className="mt-2 text-[0.95rem] leading-7 text-ink-2">Pick your house model once. Every new photo uses it automatically.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- how it works */}
      <section id="how" className="bg-surface-2/70">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <p className="eyebrow mb-3">How it works</p>
            <h2 className="display-lg">Three steps. The middle one is ours.</h2>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            <Step n={1} icon={Camera} title="Take the photo" body="Hanger, table or mannequin, in your shop, with your phone. A busy background is fine; we remove it.">
              <div className="image-frame aspect-[4/5]">
                <Image src={BEFORE} alt="A kurta photographed on a mannequin in a shop" fill sizes="(min-width: 768px) 340px, 90vw" className="object-cover" />
              </div>
            </Step>
            <Step n={2} icon={Sparkles} title="We make it" body="Your house model, your background, same suit. Checked before you see it.">
              <div className="card flex aspect-[4/5] flex-col justify-end gap-3 p-5">
                <div className="space-y-2.5">
                  {[
                    ["Checking the photo", true],
                    ["Dressing the model", true],
                    ["Matching colour and embroidery", true],
                    ["Quality check", false],
                  ].map(([label, done]) => (
                    <div key={label as string} className="flex items-center gap-3 text-sm">
                      <span className={`grid h-5 w-5 place-items-center rounded-full ${done ? "bg-teal text-white" : "border-2 border-accent"}`} aria-hidden="true">
                        {done ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className={done ? "text-ink-2" : "font-semibold text-ink"}>{label as string}</span>
                    </div>
                  ))}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full w-[82%] rounded-full bg-accent" />
                </div>
                <p className="text-xs text-ink-3">About 60 seconds</p>
              </div>
            </Step>
            <Step n={3} icon={MessageCircle} title="Share it" body="One tap to WhatsApp or Instagram, in the right size. Every photo stays in your gallery.">
              <div className="image-frame aspect-[4/5]">
                <Image src={AFTER} alt="The same kurta on a model" fill sizes="(min-width: 768px) 340px, 90vw" className="object-cover" />
                <div className="absolute inset-x-3 bottom-3 flex gap-2">
                  <span className="flex-1 rounded-full bg-accent px-3 py-2 text-center text-xs font-bold text-on-accent">Share</span>
                  <span className="flex-1 rounded-full bg-white/95 px-3 py-2 text-center text-xs font-bold text-night">Save</span>
                </div>
              </div>
            </Step>
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------- garments */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="eyebrow mb-3">Made for Indian wear</p>
            <h2 className="display-lg">{garmentCopy.heading}</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-ink-2">{garmentCopy.note}</p>
        </div>
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {garmentCopy.items.map((g) => (
            <li key={g.label} className={`rounded-full border px-4 py-2 text-sm font-semibold ${g.live ? "border-line-strong bg-surface text-ink" : "border-dashed border-line-strong text-ink-3"}`}>
              {g.live ? g.label : `${g.label} · coming later`}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- pricing */}
      <section id="pricing" className="bg-surface-2/70">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <p className="eyebrow mb-3">{pricing.eyebrow}</p>
            <h2 className="display-lg">{pricing.heading}</h2>
            <p className="mt-4 leading-7 text-ink-2">{pricing.blurb.replace("25 credits", `${runCredits} credits`)}</p>
          </div>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {activePacks.map((p, i) => (
              <li key={p.id} className={`card flex flex-col p-6 sm:p-7 ${i === featured ? "ring-2 ring-accent" : ""}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink-2">{p.label}</p>
                  {i === featured ? <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">Most chosen</span> : null}
                </div>
                <p className="mt-3 font-display text-4xl font-extrabold text-ink">₹{(p.amountMinor / 100).toLocaleString("en-IN")}</p>
                <p className="mt-1 text-sm text-ink-2">
                  {p.credits.toLocaleString("en-IN")} credits · {p.blurb}
                </p>
                <Button asChild className="mt-6" variant={i === featured ? "primary" : "secondary"}>
                  <Link href="/sign-in">{pricing.cta}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------- faq */}
      <section className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8">
        <p className="eyebrow mb-3 text-center">Questions</p>
        <h2 className="display-lg text-center">Things boutiques ask us</h2>
        <div className="mt-10">
          <Faq />
        </div>
      </section>

      {/* ---------------------------------------------------------- cta */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="wash flex flex-col items-center rounded-[var(--radius-card)] border border-line px-6 py-14 text-center sm:py-20">
          <h2 className="display-lg max-w-2xl">Your next piece, on a model, before the customer asks.</h2>
          <Button asChild size="lg" className="mt-8">
            <Link href="/sign-in">
              Start with free credits <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-ink-3 sm:px-8">
          <span>© 2026 Vastra Studio. Images are made with the help of AI and labelled as such.</span>
          <span className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, icon: Icon, title, body, children }: { n: number; icon: React.ComponentType<{ className?: string }>; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-5">
      {children}
      <div>
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-display text-sm font-bold text-canvas" aria-hidden="true">
            {n}
          </span>
          <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
          <h3 className="text-xl">{title}</h3>
        </div>
        <p className="mt-2 text-[0.95rem] leading-7 text-ink-2">{body}</p>
      </div>
    </li>
  );
}
