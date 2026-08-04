import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/json-ld";
import { siteConfig, mailto } from "@/config/site";
import {
  aboutPageSchema,
  breadcrumbSchema,
  CANONICAL_DESCRIPTION,
  graph,
  SITE_URL,
} from "@/lib/schema";

export const metadata: Metadata = {
  title: `About ${siteConfig.name}`,
  description: CANONICAL_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: `About ${siteConfig.name}`,
    description: CANONICAL_DESCRIPTION,
    url: `${SITE_URL}/about`,
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        schema={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
          aboutPageSchema()
        )}
      />

      <header className="flex flex-col gap-4">
        <Badge>About us</Badge>
        <h1 className="text-4xl font-semibold text-white">
          About {siteConfig.name}
        </h1>
        <p className="text-lg leading-8 text-slate-300">
          {CANONICAL_DESCRIPTION}
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-white">
          The problem we exist to solve
        </h2>
        <p className="leading-8 text-slate-300">
          Telegram is where most early crypto calls happen, and it is also where
          accountability disappears. A channel posts twenty calls, one of them
          goes 50x, and that single screenshot becomes the entire marketing
          pitch. The nineteen losses are never mentioned. Screenshots are
          trivially edited, messages get deleted, and &ldquo;we called this at
          launch&rdquo; is unfalsifiable after the fact.
        </p>
        <p className="leading-8 text-slate-300">
          The result is that choosing who to follow is guesswork, and the
          loudest channel usually wins rather than the most accurate one.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-white">What we do</h2>
        <p className="leading-8 text-slate-300">
          We read calls from public Telegram channels at the moment they are
          posted and record the timestamp. We then price each called token
          against on-chain data from that exact entry point forward, and keep
          tracking it. That produces four numbers per channel that cannot be
          cherry-picked:
        </p>
        <ul className="flex flex-col gap-3 text-slate-300">
          <li className="leading-8">
            <strong className="text-white">Average ROI</strong> — the mean
            return across <em>every</em> call, winners and losers alike.
          </li>
          <li className="leading-8">
            <strong className="text-white">Win rate</strong> — what share of
            calls actually finished in profit.
          </li>
          <li className="leading-8">
            <strong className="text-white">Simulated PnL</strong> — what a fixed
            position size on every call would have returned.
          </li>
          <li className="leading-8">
            <strong className="text-white">Breakout multiples</strong> — how
            often a call reached 2x, 10x, or 100x.
          </li>
        </ul>
        <p className="leading-8 text-slate-300">
          Because every call is counted, a channel cannot improve its score by
          deleting a bad call after the fact. We already recorded it.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-white">
          How rankings are decided
        </h2>
        <p className="leading-8 text-slate-300">
          Our composite score weights average ROI at 50%, win rate at 30%, and
          call volume at 20%. Volume is log-scaled deliberately: a channel with
          400 calls has proven more than one with 4, but it should not dominate
          purely by posting constantly.
        </p>
        <p className="leading-8 text-slate-300">
          Channels with almost no recorded history are shown but ranked at the
          bottom, because a 100% win rate across two calls is noise, not skill.{" "}
          <Link
            href="/ranking-methodology"
            className="text-cyan-400 hover:underline"
          >
            Read the full ranking methodology
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-white">
          How we stay independent
        </h2>
        <p className="leading-8 text-slate-300">
          Channels cannot pay for a better rank. Sponsored placements exist, but
          they are labeled as sponsored, appear in fixed slots, and are excluded
          from scoring entirely. Paid-access channels are tracked separately and
          kept out of the main performance leaderboard so that free and paid
          channels are never compared on uneven footing.
        </p>
        <p className="leading-8 text-slate-300">
          If a ranking could be bought, the entire dataset would be worthless —
          including to us.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-white">
          What we are not
        </h2>
        <p className="leading-8 text-slate-300">
          We are not a signal group, we do not give financial advice, and we do
          not tell you what to buy. We publish measured historical performance
          so you can decide who is worth listening to. Past performance does not
          predict future results, and simulated PnL excludes slippage, fees, and
          partial exits.{" "}
          <Link href="/disclaimer" className="text-cyan-400 hover:underline">
            See our full disclaimer
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-6">
        <h2 className="text-2xl font-semibold text-white">Get in touch</h2>
        <p className="leading-8 text-slate-300">
          Spotted a call we mis-priced or a channel we should be tracking? We
          want to know — accuracy complaints get priority.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/submit"
            className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/15 px-4 py-2 text-sm text-cyan-100"
          >
            Submit a channel
          </Link>
          <Link
            href="/contact"
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300"
          >
            Contact us
          </Link>
          <a
            href={mailto("support")}
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300"
          >
            {siteConfig.email.support}
          </a>
        </div>
      </section>
    </div>
  );
}
