import Link from "next/link";
import { Send, Bot } from "lucide-react";

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-6.9L4.5 22H1.4l8-9.1L1 2h7l4.9 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
    </svg>
  );
}

const contactLinks = [
  {
    label: "X",
    href: "https://x.com/kelucallsx?s=20",
    icon: XIcon,
  },
  {
    label: "Telegram",
    href: "https://t.me/kELUSCALLGOOOO",
    icon: Send,
  },
  {
    label: "Bot",
    href: "https://t.me/KeluCallsAlerts_bot",
    icon: Bot,
  },
];

const productLinks = [
  { href: "/channels", label: "Channels" },
  { href: "/trending", label: "Trending Tokens" },
  { href: "/live", label: "Live Calls" },
  { href: "/listing-policy", label: "Submit Channel" },
];

const resourceLinks = [
  { href: "/help", label: "Help Center" },
  { href: "/faq", label: "FAQ" },
  { href: "/ranking-methodology", label: "Ranking Methodology" },
  { href: "/community-guidelines", label: "Community Guidelines" },
];

const legalLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/dmca", label: "DMCA" },
];

const businessLinks = [
  { href: "/advertiser-policy", label: "Advertise" },
  { href: "/listing-policy", label: "Listing Policy" },
  { href: "/contact", label: "Contact" },
];

function LinkGroup({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-slate-400 transition-colors hover:text-cyan-400"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/8 py-8">
      <div className="mx-auto max-w-7xl px-4 text-sm text-slate-400 sm:px-6 lg:px-8">
        {/* Navigation Groups - Desktop */}
        <div className="hidden grid-cols-4 gap-8 pb-8 md:grid">
          <LinkGroup title="Product" links={productLinks} />
          <LinkGroup title="Resources" links={resourceLinks} />
          <LinkGroup title="Legal" links={legalLinks} />
          <LinkGroup title="Business" links={businessLinks} />
        </div>

        {/* Navigation Groups - Mobile */}
        <div className="grid grid-cols-2 gap-6 pb-8 md:hidden">
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Product
            </h3>
            <ul className="flex flex-col gap-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Resources
            </h3>
            <ul className="flex flex-col gap-2">
              {resourceLinks.slice(0, 2).map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Legal
            </h3>
            <ul className="flex flex-col gap-2">
              {legalLinks.slice(0, 2).map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Business
            </h3>
            <ul className="flex flex-col gap-2">
              {businessLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-2 border-t border-white/8 pt-6">
          <p>Kelucalls ranks Telegram crypto channels on realized call performance.</p>
          <p>Sponsored placements are labeled separately and never alter leaderboard scores.</p>
        </div>

        {/* Contact links */}
        <div className="flex flex-col gap-3 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Reach out to us
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {contactLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-slate-400 transition-colors hover:text-blue-300"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Credit */}
        <div className="flex flex-col items-center gap-1 border-t border-white/8 pt-4 text-center text-xs text-slate-500 sm:flex-row sm:justify-between sm:text-left">
          <span>
            Built by{" "}
            <a
              href="https://sevmeta.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 transition-colors hover:text-blue-300"
            >
              SevMeta
            </a>
          </span>

          <span>
            Partners with{" "}
            <a
              href="https://sevlabx.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 transition-colors hover:text-blue-300"
            >
              SevLabs
            </a>
          </span>
        </div>

      </div>
    </footer>
  );
}