import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/json-ld";
import { SubmissionForm } from "@/components/submission-form";
import { siteConfig } from "@/config/site";
import { breadcrumbSchema, graph, ORG_ID, SITE_ID, SITE_URL } from "@/lib/schema";

const title = "Submit a Telegram channel for tracking";
const description =
  "Add a public Telegram crypto channel to Kelucalls. Submissions enter a review queue, then every future call is tracked and scored on realized ROI, win rate, and simulated PnL.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/submit` },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/submit`,
    type: "website",
  },
};

const steps = [
  {
    heading: "1. You submit the handle",
    body: "We only need the public Telegram handle. The channel must be public — we cannot read private or invite-only channels.",
  },
  {
    heading: "2. We review it",
    body: "A human checks that the channel actually posts identifiable token calls rather than commentary, and that it is not a duplicate of one we already track.",
  },
  {
    heading: "3. Tracking starts going forward",
    body: "Once approved, every new call is recorded at its message timestamp and priced from that entry point. We do not backfill history, so a new listing starts with zero calls and builds a record over time.",
  },
];

export default function SubmitPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        schema={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Submit a channel", path: "/submit" },
          ]),
          {
            "@type": "WebPage",
            "@id": `${SITE_URL}/submit#webpage`,
            url: `${SITE_URL}/submit`,
            name: title,
            description,
            isPartOf: { "@id": SITE_ID },
            publisher: { "@id": ORG_ID },
            inLanguage: "en-US",
          }
        )}
      />

      <header className="flex flex-col gap-4">
        <Badge>Submit a channel</Badge>
        <h1 className="text-4xl font-semibold text-white">{title}</h1>
        <p className="max-w-3xl text-lg leading-8 text-slate-300">
          {description}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold text-white">How it works</h2>
          {steps.map((step) => (
            <div
              key={step.heading}
              className="rounded-2xl border border-white/10 bg-slate-950/60 p-5"
            >
              <h3 className="text-base font-semibold text-white">
                {step.heading}
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                {step.body}
              </p>
            </div>
          ))}

          <p className="text-sm leading-7 text-slate-400">
            Submitting a channel does not influence its ranking, and it is free.
            Rankings are determined purely by measured call performance — review{" "}
            <Link
              href="/listing-policy"
              className="text-cyan-400 hover:underline"
            >
              our listing policy
            </Link>{" "}
            before submitting.
          </p>
        </section>

        <Card className="h-fit">
          <CardContent className="space-y-4 p-6">
            <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
              Channel details
            </Badge>
            <p className="text-sm leading-7 text-slate-400">
              Submissions enter a pending queue. No account needed.
            </p>
            <SubmissionForm />
            <p className="text-xs leading-6 text-slate-500">
              Questions? Email{" "}
              <a
                href={`mailto:${siteConfig.email.listings}`}
                className="text-cyan-400 hover:underline"
              >
                {siteConfig.email.listings}
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
