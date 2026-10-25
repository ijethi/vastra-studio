"use client";

import { Accordion } from "radix-ui";
import { ChevronDown } from "lucide-react";

const QA: Array<[string, string]> = [
  ["Will the suit look exactly like mine?", "For photos taken on a mannequin or dress form, yes: we keep your garment's own pixels and only draw the model and the background around them. For hanger or flat-lay photos the model redraws the garment, and every result is checked against your photo. Anything that drifts is never shown and never charged."],
  ["Do I need a studio or a white background?", "No. Photograph in your shop as you do today. The app removes the background and corrects the shop lighting itself."],
  ["How long does it take?", "Usually under a minute for photos. Reels take a few minutes because each scene is animated separately; you can leave the page and find the reel in your gallery."],
  ["What does it cost?", "Credits, no monthly fee. Two versions of a piece cost 25 credits. Packs start at ₹375 for 250 credits, about ten pieces. Credits do not expire while your account is active."],
  ["Is it clear the images are made with AI?", "Each image carries a provenance note saying it was made with the help of AI, and the garment is as you photographed it. You decide how to describe it to your customers."],
  ["Can my staff use it?", "Yes. Invite staff to your boutique; they can add photos and make images without seeing billing."],
];

export function Faq() {
  return (
    <Accordion.Root type="single" collapsible className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
      {QA.map(([q, a], i) => (
        <Accordion.Item key={q} value={`q${i}`} className="px-5 sm:px-6">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-5 text-left text-[1.02rem] font-semibold text-ink">
              {q}
              <ChevronDown className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="pb-5 text-[0.95rem] leading-7 text-ink-2">{a}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
