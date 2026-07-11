import type { Metadata } from "next";
import { SearchBar } from "@/components/ui/search-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import Link from "next/link";
import {
  Rocket,
  Search,
  Users,
  Megaphone,
  Bug,
  ArrowRight,
  FileText,
  Gauge,
  MessageCircle,
  ExternalLink,
  Send,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Help Center | Kelucalls",
  description:
    "Find answers to your questions about Kelucalls, our ranking methodology, channel submissions, and more.",
  alternates: {
    canonical: "/help",
  },
};

interface HelpCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  articles: { title: string; excerpt: string; href: string }[];
}

const categories: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Learn the basics of Kelucalls",
    icon: Rocket,
    articles: [
      {
        title: "What is Kelucalls?",
        excerpt: "Understand what Kelucalls does and how it helps you find the best crypto signal channels.",
        href: "/faq",
      },
      {
        title: "How Rankings Work",
        excerpt: "Learn how we algorithmically rank Telegram crypto channels based on historical performance.",
        href: "/ranking-methodology",
      },
      {
        title: "Understanding ROI",
        excerpt: "Discover how we calculate Return on Investment for tracked crypto calls.",
        href: "/ranking-methodology",
      },
      {
        title: "Understanding Win Rate",
        excerpt: "Learn how win rate is calculated and what it means for channel performance.",
        href: "/ranking-methodology",
      },
      {
        title: "Understanding Smart Score",
        excerpt: "Our proprietary composite score that combines multiple metrics for accurate rankings.",
        href: "/ranking-methodology",
      },
    ],
  },
  {
    id: "using-kelucalls",
    title: "Using Kelucalls",
    description: "Master the platform features",
    icon: Search,
    articles: [
      {
        title: "Finding Telegram Channels",
        excerpt: "Browse and discover crypto signal channels that match your trading preferences.",
        href: "/channels",
      },
      {
        title: "Viewing Trending Tokens",
        excerpt: "Explore which tokens are currently being mentioned across tracked channels.",
        href: "/trending",
      },
      {
        title: "Understanding Live Calls",
        excerpt: "Track real-time crypto signals as they come in from our monitored channels.",
        href: "/live",
      },
      {
        title: "Reading Channel Statistics",
        excerpt: "Deep dive into channel performance metrics, historical data, and consistency scores.",
        href: "/channel/example",
      },
      {
        title: "Understanding Token Pages",
        excerpt: "Explore detailed token information including price, volume, and channel mentions.",
        href: "/tokens",
      },
    ],
  },
  {
    id: "channel-owners",
    title: "Channel Owners",
    description: "Submit and manage your channel",
    icon: Users,
    articles: [
      {
        title: "Submit a Channel",
        excerpt: "Learn how to submit your Telegram channel for tracking and ranking.",
        href: "/channel/submit",
      },
      {
        title: "Verification Process",
        excerpt: "Understand our verification badges and what they mean for channel credibility.",
        href: "/listing-policy",
      },
      {
        title: "Updating Channel Information",
        excerpt: "Keep your channel details accurate and up-to-date.",
        href: "/contact",
      },
      {
        title: "Requesting Removal",
        excerpt: "Learn how to request removal of your channel from our platform.",
        href: "/listing-policy",
      },
      {
        title: "Appeal Process",
        excerpt: "If your channel was rejected, learn how to appeal the decision.",
        href: "/listing-policy",
      },
    ],
  },
  {
    id: "advertisers",
    title: "Advertisers",
    description: "Promote your services ethically",
    icon: Megaphone,
    articles: [
      {
        title: "Sponsored Placements",
        excerpt: "Understand how sponsored listings work and their impact on rankings.",
        href: "/advertiser-policy",
      },
      {
        title: "Banner Advertisements",
        excerpt: "Display your ads across Kelucalls with our banner advertising options.",
        href: "/advertiser-policy",
      },
      {
        title: "Campaign Approval",
        excerpt: "Learn about our advertising approval process and guidelines.",
        href: "/advertiser-policy",
      },
      {
        title: "Advertising Guidelines",
        excerpt: "Our strict guidelines ensure only legitimate projects can advertise.",
        href: "/advertiser-policy",
      },
    ],
  },
  {
    id: "technical-support",
    title: "Technical Support",
    description: "Get help with issues",
    icon: Bug,
    articles: [
      {
        title: "Report Bugs",
        excerpt: "Found an issue? Let us know so we can fix it.",
        href: "/contact",
      },
      {
        title: "Performance Issues",
        excerpt: "Troubleshooting tips for slow loading or functionality problems.",
        href: "/contact",
      },
      {
        title: "Contact Support",
        excerpt: "Get in touch with our team for personalized assistance.",
        href: "/contact",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/8 bg-gradient-to-b from-slate-950 to-slate-900/50 py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_40%)]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: "Help Center" }]} className="mb-8" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How can we help?
            </h1>
            <p className="mb-8 text-lg text-slate-400">
              Find answers to your questions about Kelucalls, channel rankings, and
              more.
            </p>
            <SearchBar
              placeholder="Search for help articles..."
              className="mx-auto max-w-xl"
            />
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white">Browse by Category</h2>
          <p className="mt-2 text-slate-400">
            Find the information you need organized by topic
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Card
                key={category.id}
                className="group transition-all duration-300 hover:border-cyan-400/30 hover:shadow-[0_0_40px_rgba(34,211,238,0.1)]"
              >
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400 transition-transform group-hover:scale-110">
                    <Icon className="size-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">
                    {category.title}
                  </h3>
                  <p className="mb-4 text-sm text-slate-400">
                    {category.description}
                  </p>
                  <ul className="space-y-3">
                    {category.articles.slice(0, 4).map((article) => (
                      <li key={article.href}>
                        <Link
                          href={article.href}
                          className="group/link flex items-start gap-2 text-sm text-slate-400 transition-colors hover:text-cyan-400"
                        >
                          <ArrowRight className="mt-0.5 size-3 shrink-0 transition-transform group-hover/link:translate-x-1" />
                          <span>{article.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="border-t border-white/8 bg-white/[0.02] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold text-white">Quick Links</h2>
            <p className="mt-2 text-slate-400">
              Most popular resources and pages
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/faq"
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-cyan-400/30 hover:bg-white/[0.08]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-400">
                <MessageCircle className="size-6" />
              </div>
              <div>
                <h3 className="font-medium text-white">FAQ</h3>
                <p className="text-sm text-slate-400">Common questions</p>
              </div>
            </Link>

            <Link
              href="/ranking-methodology"
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-cyan-400/30 hover:bg-white/[0.08]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                <Gauge className="size-6" />
              </div>
              <div>
                <h3 className="font-medium text-white">Rankings</h3>
                <p className="text-sm text-slate-400">How we calculate</p>
              </div>
            </Link>

            <Link
              href="/listing-policy"
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-cyan-400/30 hover:bg-white/[0.08]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-purple-400/10 text-purple-400">
                <FileText className="size-6" />
              </div>
              <div>
                <h3 className="font-medium text-white">Listing Policy</h3>
                <p className="text-sm text-slate-400">Submit channels</p>
              </div>
            </Link>

            <Link
              href="/contact"
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-cyan-400/30 hover:bg-white/[0.08]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                <Send className="size-6" />
              </div>
              <div>
                <h3 className="font-medium text-white">Contact</h3>
                <p className="text-sm text-slate-400">Get in touch</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Still Need Help CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-cyan-400/10 to-emerald-400/10 p-8 text-center lg:p-12">
          <h2 className="mb-4 text-2xl font-bold text-white">
            Still need help?
          </h2>
          <p className="mx-auto mb-6 max-w-lg text-slate-400">
            Can&apos;t find what you&apos;re looking for? Our support team is here to
            assist you with any questions.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 font-medium text-slate-950 transition-all hover:scale-105 hover:bg-cyan-400"
          >
            Contact Support
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}