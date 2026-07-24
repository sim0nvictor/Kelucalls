import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";
import { siteConfig, mailto } from "@/config/site";

export const metadata: Metadata = {
  title: `Advertiser Policy | ${siteConfig.name}`,
  description:
    `Advertising Policy for ${siteConfig.name} - Learn about our advertising guidelines, approval process, and prohibited content.`,
  alternates: {
    canonical: "/advertiser-policy",
  },
};

const toc: TOCItem[] = [
  { id: "overview", title: "Overview" },
  { id: "eligible-advertisers", title: "Eligible Advertisers" },
  { id: "sponsored-placements", title: "Sponsored Placements" },
  { id: "banner-ads", title: "Banner Advertisements" },
  { id: "approval", title: "Approval Process" },
  { id: "prohibited", title: "Prohibited Advertising" },
  { id: "guidelines", title: "Advertising Guidelines" },
  { id: "contact", title: "Contact" },
];

export default function AdvertiserPolicyPage() {
  return (
    <LegalLayout
      title="Advertiser Policy"
      description="Guidelines and policies for advertising on Kelucalls."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <h2 id="overview">Overview</h2>
      <p>
        Kelucalls offers advertising opportunities for legitimate cryptocurrency
        projects and services. We maintain strict guidelines to ensure our users
        are protected from scams and fraudulent activities. All sponsored content
        is clearly labeled and never influences organic rankings.
      </p>

      <Callout variant="info" title="Transparency First">
        We believe in complete transparency. Sponsored content is always clearly
        distinguished from organic rankings and editorial content.
      </Callout>

      <h2 id="eligible-advertisers">Eligible Advertisers</h2>
      <p>We accept advertising from:</p>
      <ul>
        <li>
          <strong>Legitimate Cryptocurrency Projects:</strong> Projects with real
          products, active development, and transparent teams
        </li>
        <li>
          <strong>Exchanges:</strong> Licensed and regulated cryptocurrency exchanges
        </li>
        <li>
          <strong>Wallet Providers:</strong> Reputable cryptocurrency wallet services
        </li>
        <li>
          <strong>Analytics Platforms:</strong> Data and analytics services for
          crypto traders
        </li>
        <li>
          <strong>Educational Platforms:</strong> Trading education and crypto
          learning resources
        </li>
        <li>
          <strong>Blockchain Services:</strong> Legitimate on-chain services and tools
        </li>
      </ul>
      <p>
        Advertisers must provide documentation proving their legitimacy, including
        team information, product details, and any relevant licenses or
        registrations.
      </p>

      <h2 id="sponsored-placements">Sponsored Placements</h2>
      <p>
        Channel owners can sponsor their listings to increase visibility. Sponsored
        placements feature:
      </p>
      <ul>
        <li>Enhanced visibility in channel listings</li>
        <li>Featured placement badges</li>
        <li>Separate &quot;Sponsored&quot; category</li>
        <li>Clear labeling as advertising</li>
      </ul>
      <Callout variant="warning" title="Separate from Rankings">
        Sponsored placements do NOT affect organic rankings. Our algorithm
        treats sponsored channels identically to non-sponsored ones when
        calculating performance scores.
      </Callout>

      <h2 id="banner-ads">Banner Advertisements</h2>
      <p>
        We offer various banner advertising formats across the Platform:
      </p>
      <ul>
        <li>
          <strong>Header Banners:</strong> Displayed at the top of page sections
        </li>
        <li>
          <strong>Sidebar Banners:</strong> Visible on page sidebars
        </li>
        <li>
          <strong>Interstitial Ads:</strong> Between content sections
        </li>
        <li>
          <strong>Footer Banners:</strong> Displayed in footer areas
        </li>
      </ul>
      <p>
        All banners are subject to approval and must meet our content guidelines.
      </p>

      <h2 id="approval">Approval Process</h2>
      <p>All advertising campaigns go through our approval process:</p>
      <ol>
        <li>
          <strong>Application:</strong> Submit your advertising request with
          project details
        </li>
        <li>
          <strong>Documentation:</strong> Provide required documentation (team,
          product, licenses)
        </li>
        <li>
          <strong>Review:</strong> Our team reviews the application (5-7 business
          days)
        </li>
        <li>
          <strong>Approval:</strong> Approved campaigns can proceed to payment and
          launch
        </li>
        <li>
          <strong>Monitoring:</strong> Ongoing compliance monitoring throughout the
          campaign
        </li>
      </ol>

      <h2 id="prohibited">Prohibited Advertising</h2>
      <Callout variant="error" title="Zero Tolerance">
        The following types of advertising are strictly prohibited and will be
        rejected.
      </Callout>

      <h3>Scams and Fraud</h3>
      <ul>
        <li>Ponzi schemes and pyramid schemes</li>
        <li>Fake airdrops and token claims</li>
        <li>Phishing websites and services</li>
        <li>Rug pull projects</li>
        <li>Fake exchanges</li>
      </ul>

      <h3>Malicious Content</h3>
      <ul>
        <li>Malware and ransomware</li>
        <li>Spyware and keyloggers</li>
        <li>Cryptojacking scripts</li>
        <li>Fake wallet download links</li>
      </ul>

      <h3>Illegal Activities</h3>
      <ul>
        <li>Unlicensed gambling services</li>
        <li>Dark web marketplaces</li>
        <li>Money laundering services</li>
        <li>Illegal financial services</li>
      </ul>

      <h3>Deceptive Practices</h3>
      <ul>
        <li>False promises of guaranteed returns</li>
        <li>Misleading tokenomics</li>
        <li>Fake celebrity endorsements</li>
        <li>Misrepresented team members</li>
      </ul>

      <h2 id="guidelines">Advertising Guidelines</h2>
      <p>Approved advertisements must adhere to the following guidelines:</p>
      <ul>
        <li>
          <strong>Accuracy:</strong> All claims must be factual and verifiable
        </li>
        <li>
          <strong>Clarity:</strong> No misleading language or fine print
        </li>
        <li>
          <strong>Risk Disclosure:</strong> Must include appropriate risk warnings
        </li>
        <li>
          <strong>No Guarantees:</strong> Cannot promise specific returns
        </li>
        <li>
          <strong>Professional Design:</strong> Must meet our quality standards
        </li>
        <li>
          <strong>Compliance:</strong> Must comply with applicable advertising
          regulations
        </li>
      </ul>
      <p>
        We reserve the right to reject any advertisement that violates our
        guidelines or could harm our users.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        To inquire about advertising opportunities, please contact us at{" "}
        <a href={mailto("ads")} className="text-cyan-400 hover:underline">
          {siteConfig.email.ads}
        </a>{" "}
        or through our{" "}
        <a href="/contact" className="text-cyan-400 hover:underline">
          contact page
        </a>
        .
      </p>
    </LegalLayout>
  );
}