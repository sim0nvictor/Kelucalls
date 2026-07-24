import type { Metadata } from "next";
import { Accordion, type AccordionItem } from "@/components/ui/accordion"
import { SearchBar } from "@/components/ui/search-bar"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { siteConfig } from "@/config/site";


export const metadata: Metadata = {
  title: `FAQ | ${siteConfig.name}`,
  description:
    `Frequently asked questions about ${siteConfig.name}, ranking methodology, channel submissions, and crypto signal tracking.`,
  alternates: {
    canonical: "/faq",
  },
};

const faqItems: AccordionItem[] = [
  {
    id: "what-is-kelucalls",
    title: "What is Kelucalls?",
    content:
      "Kelucalls is a crypto intelligence platform that tracks, analyzes, and ranks Telegram crypto signal channels. We monitor channels that share trading calls and calculate their historical performance based on ROI, win rate, and other metrics. Our platform helps traders discover high-performing channels and make informed decisions about which signal providers to follow.",
  },
  {
    id: "how-rankings-calculated",
    title: "How are rankings calculated?",
    content:
      "Our rankings are generated algorithmically using historical tracked call performance. We calculate multiple metrics including Smart Score (our proprietary composite score), Average ROI, Win Rate, Peak ROI, Number of Calls, and Consistency. Rankings are based purely on data—no manual intervention or editorial bias influences the leaderboard. Sponsored placements are always clearly labeled and never affect organic rankings.",
  },
  {
    id: "how-often-updated",
    title: "How often is data updated?",
    content:
      "We update our data in real-time as we track new calls from monitored channels. The live feed shows calls as they happen, while ranking calculations are refreshed continuously throughout the day. Historical performance data is recalculated as we verify new outcomes for tracked calls. Most major updates to rankings occur every few hours, with significant changes typically reflecting within 24 hours.",
  },
  {
    id: "submit-channel",
    title: "Can I submit my Telegram channel?",
    content:
      "Yes! We welcome channel submissions from Telegram crypto signal providers. To submit your channel, visit our listing policy page and follow the submission process. All channels undergo a review process to verify they meet our eligibility requirements. Channels must be public, focused on crypto trading signals, and meet minimum activity thresholds.",
  },
  {
    id: "verify-channel",
    title: "How do I verify my channel?",
    content:
      "Channel verification is available for channels that meet our verification criteria. Verified channels receive a blue checkmark badge, indicating that the channel owner has confirmed ownership. To request verification, submit your channel through our platform and provide proof of ownership. Our team will review your request and verify authentic channels.",
  },
  {
    id: "ranking-changed",
    title: "Why did my ranking change?",
    content:
      "Rankings change as we track new calls and verify outcomes for existing ones. Several factors can cause ranking movements: new calls with positive or negative ROI, outcome verifications that adjust historical stats, increased call volume from competing channels, and consistency changes over time. Our ranking methodology is transparent—you can review exactly how each metric is calculated on our ranking methodology page.",
  },
  {
    id: "advertise",
    title: "Can I advertise on Kelucalls?",
    content:
      "Yes, we offer advertising options for legitimate crypto projects and services. We maintain strict advertising guidelines and reject ads from scams, phishing sites, fake airdrops, ponzi schemes, and illegal financial services. All sponsored content is clearly labeled and separate from organic rankings. Visit our advertiser policy page for more information about advertising opportunities.",
  },
  {
    id: "remove-listing",
    title: "How do I remove my listing?",
    content:
      "Channel owners can request removal of their channel from Kelucalls at any time. Simply contact us through our contact page with your request and verification of channel ownership. We process removal requests within 5-7 business days. Note that historical data may remain in our archives even after removal.",
  },
  {
    id: "guarantee-profits",
    title: "Does Kelucalls guarantee profitable calls?",
    content:
      "No. Kelucalls does not guarantee profits or provide investment advice. Our platform tracks and analyzes historical performance of crypto signal channels, but past performance does not guarantee future results. Trading cryptocurrency involves significant risk, and you should only trade with funds you can afford to lose. Always conduct your own research before making any investment decisions.",
  },
  {
    id: "token-not-listed",
    title: "Why isn't my token listed?",
    content:
      "Tokens appear on Kelucalls when they are mentioned in calls from tracked channels. If a token you&apos;re interested in isn&apos;t listed, it likely hasn&apos;t been featured in any tracked signals yet. We don&apos;t manually add tokens—we only display tokens that channels have called. You can track specific tokens by following channels that frequently mention them.",
  },
  {
    id: "data-accuracy",
    title: "How accurate is the data?",
    content:
      "We strive for accuracy but note that crypto call tracking has inherent challenges. Our team verifies outcomes by checking if tokens reached specified price targets within stated timeframes. However, some calls may not have clear entry/exit points, and channel creators may edit or delete messages. We encourage users to verify signals independently and understand that all data represents historical performance, not predictions.",
  },
  {
    id: "channel-owner",
    title: "I'm a channel owner. How can I improve my ranking?",
    content:
      "Focus on consistent, high-quality signals. Our ranking methodology rewards channels with strong ROI, high win rates, and consistent performance over time. Here are some tips: provide clear entry and exit points for calls, maintain transparency about wins and losses, post regular updates, and build a track record of verifiable successful predictions. Avoid manipulating statistics—this will result in removal.",
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/8 bg-gradient-to-b from-slate-950 to-slate-900/50 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_50%)]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: "FAQ" }]} className="mb-6" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-slate-400">
              Find answers to the most common questions about Kelucalls
            </p>
          </div>
        </div>
      </section>

      {/* Search and Content */}
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10">
          <SearchBar
            placeholder="Search FAQ..."
            className="mx-auto max-w-xl"
          />
        </div>

        <Accordion
          items={faqItems}
          allowMultiple
          className="mx-auto max-w-2xl"
        />
      </div>

      {/* Still Need Help */}
      <section className="border-t border-white/8 bg-white/[0.02] py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-xl font-bold text-white">
            Can&apos;t find what you&apos;re looking for?
          </h2>
          <p className="mb-6 text-slate-400">
            Our support team is ready to help with any questions.
          </p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-6 py-3 text-white transition-all hover:border-cyan-400/40 hover:bg-white/10"
          >
            Contact Support
          </a>
        </div>
      </section>
    </div>
  );
}