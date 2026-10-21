import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Camera, Check, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";
import { CompareSlider } from "@/components/marketing/compare-slider";

export const metadata = { title: { absolute: "Vastra Studio · Your suit, on a model, in a minute" } };

const BEFORE = "/samples/real-mannequin-coral-kurta.webp";
const AFTER = "/samples/reference-fashn-output-coral-kurta.webp";

const garments = ["Kurta sets", "Anarkalis", "Kaftans", "Co-ord sets", "Lehengas", "Sharara sets", "Western wear", "Sarees · after pilot"];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ---------------------------------------------------------------- hero */}
      <section className="night relative overflow-hidden">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Wordmark onDark />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-night-ink-2 hover:bg-white/10 hover:text-night-ink">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-in">Start free</Link>
            </Button>
          </nav>
        </header>

        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-16">
          <div className="fade-up">
            <p className="eyebrow mb-6 text-night-ink-2">For boutiques in India</p>
            <h1 className="display-xl text-night-ink">
              Your suit.
              <br />
              On a model.
              <br />
              <span className="text-accent">In a minute.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-night-ink-2">
              Take the photo you already take, on the hanger or the mannequin. Vastra puts it on a model with the same colour, embroidery and fall, ready for WhatsApp and Instagram.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  Start free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Link href="#how" className="text-sm font-semibold text-night-ink underline-offset-4 hover:underline">
                See how it works
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-night-ink-2">
              {["Free credits to start", "No card needed", "Pay only for photos that pass our check"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-gold" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-md fade-up [animation-delay:150ms]">
            <CompareSlider before={BEFORE} after={AFTER} className="shadow-[var(--shadow-lg)]" />
            <p className="mt-3 text-center text-xs text-night-ink-2">A real boutique photo, taken in the shop. Drag the handle.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- how it works */}
      <section id="how" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-xl">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="display-lg">Three steps. The middle one is ours.</h2>
        </div>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          <Step n={1} icon={Camera} title="Take the photo" body="Hanger, table or mannequin, in your shop, with your phone. A busy background is fine; we remove it.">
            <div className="image-frame aspect-[4/5]">
              <Image src={BEFORE} alt="A kurta photographed on a mannequin in a shop" fill sizes="(min-width: 768px) 320px, 90vw" className="object-cover" />
            </div>
          </Step>
          <Step n={2} icon={Sparkles} title="We make it" body="Your house model, your background, same suit. Every image is checked before you see it, and anything that changes the suit is thrown away unpaid.">
            <div className="card flex aspect-[4/5] flex-col justify-end gap-3 p-5">
              <div className="space-y-2">
                {[
                  ["Checking the photo", true],
                  ["Dressing the model", true],
                  ["Matching colour and embroidery", true],
                  ["Quality check", false],
                ].map(([label, done]) => (
                  <div key={label as string} className="flex items-center gap-3 text-sm">
                    <span className={`grid h-5 w-5 place-items-center rounded-full ${done ? "bg-success text-white" : "border-2 border-accent"}`} aria-hidden="true">
                      {done ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className={done ? "text-ink-2" : "font-semibold text-ink"}>{label as string}</span>
                  </div>
                ))}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-[82%] rounded-full bg-accent" />
              </div>
              <p className="text-xs text-ink-3">About 60 seconds</p>
            </div>
          </Step>
          <Step n={3} icon={MessageCircle} title="Share it" body="One tap to WhatsApp or Instagram, in the right size. Every photo stays in your gallery.">
            <div className="image-frame aspect-[4/5]">
              <Image src={AFTER} alt="The same kurta on a model" fill sizes="(min-width: 768px) 320px, 90vw" className="object-cover" />
              <div className="absolute inset-x-3 bottom-3 flex gap-2">
                <span className="flex-1 rounded-full bg-accent px-3 py-2 text-center text-xs font-semibold text-on-accent">Share</span>
                <span className="flex-1 rounded-full bg-white/90 px-3 py-2 text-center text-xs font-semibold text-night">Save</span>
              </div>
            </div>
          </Step>
        </ol>
      </section>

      {/* ---------------------------------------------------------- promise */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow mb-3">The promise</p>
            <h2 className="display-lg">If the suit changes, you do not pay.</h2>
            <p className="mt-5 max-w-lg leading-8 text-ink-2">
              Boutiques sell the exact piece on the rail. So every image is compared against your photo: colour, print, embroidery, neckline, length. If it drifts, it never reaches you and the credits come straight back.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["Same colour", "Matched to your photo, not to a guess."],
              ["Same embroidery", "Zari, sequins and borders stay where they are."],
              ["Natural fall", "Fabric weight and drape checked on every image."],
              ["Real-looking model", "Hands, face and light checked before you see it."],
            ].map(([t, b]) => (
              <li key={t} className="card p-5">
                <ShieldCheck className="mb-3 h-5 w-5 text-accent" aria-hidden="true" />
                <p className="font-display text-lg font-bold text-ink">{t}</p>
                <p className="mt-1 text-sm leading-6 text-ink-2">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------- garments */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="eyebrow mb-3">Made for Indian wear</p>
            <h2 className="display-lg">Built around what hangs in your shop.</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-ink-2">Each garment type goes live only after it passes our checks on real pieces from pilot boutiques.</p>
        </div>
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {garments.map((g) => (
            <li key={g} className={`rounded-full border px-4 py-2 text-sm font-semibold ${g.includes("after") ? "border-dashed border-line-strong text-ink-3" : "border-line-strong bg-surface text-ink"}`}>
              {g}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- pricing */}
      <section className="night">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="eyebrow mb-3 text-night-ink-2">Pricing</p>
            <h2 className="display-lg text-night-ink">Less than a cup of chai per photo.</h2>
            <p className="mt-5 max-w-lg leading-8 text-night-ink-2">
              Two versions of a piece cost 25 credits. Packs start at <span className="font-semibold text-night-ink">₹375 for 250 credits</span>, about ten pieces. No monthly fee, credits do not expire, and failed photos are refunded.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/sign-in">
              Start with free credits <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-ink-3 sm:px-8">
        <span>© 2026 Vastra Studio. Images are made with the help of AI and labelled as such.</span>
        <span className="flex gap-5">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </span>
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
          <span className="grid h-8 w-8 place-items-center rounded-full bg-night font-display text-sm font-bold text-night-ink" aria-hidden="true">
            {n}
          </span>
          <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
          <h3 className="text-xl">{title}</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-2">{body}</p>
      </div>
    </li>
  );
}
