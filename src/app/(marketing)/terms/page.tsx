import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link href="/" className="inline-block">
        <Wordmark />
      </Link>
      <h1 className="display-lg mt-10">Terms of service</h1>
      <p className="mt-2 text-sm text-ink-3">Draft for review by counsel before launch.</p>
      <div className="mt-8 space-y-4 text-[0.95rem] leading-7 text-ink-2">
        <p>You may use generated images to market garments you sell. You confirm you own or are licensed to photograph the garments you upload.</p>
        <p>Images are synthetic and carry a provenance statement. You agree not to remove it or to present a generated image as a photograph of a real person.</p>
        <p>Credits are deducted when a generation starts and refunded automatically for images that fail our quality check or when generation fails.</p>
        <p>We may suspend accounts that upload unlawful content, photos of people without consent, or attempt to generate inappropriate imagery.</p>
      </div>
    </div>
  );
}
