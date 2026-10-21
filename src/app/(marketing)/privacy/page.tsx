import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link href="/" className="inline-block">
        <Wordmark />
      </Link>
      <h1 className="display-lg mt-10">Privacy policy</h1>
      <p className="mt-2 text-sm text-ink-3">Draft for review by counsel before launch.</p>
      <div className="prose mt-8 space-y-4 text-[0.95rem] leading-7 text-ink-2">
        <p>We store the garment photos you upload, the images we generate from them, your account email and billing records. Nothing else about you or your customers.</p>
        <p>Generated images are synthetic. Our model library is AI-generated and contains no real person&apos;s likeness. We do not accept photos of real people as models in this release.</p>
        <p>To generate images we send your garment photo to third-party AI providers (currently FASHN and Google Cloud) under terms that prohibit training on your data. These providers may process data outside India.</p>
        <p>You can delete a garment or your whole account at any time. Derived images are purged within 24 hours and backups age out within 30 days.</p>
        <p>Payments are processed by Razorpay or Stripe; card details never touch our servers.</p>
      </div>
    </div>
  );
}
