import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";
import { siteConfig, mailto } from "@/config/site";

export const metadata: Metadata = {
  title: `Privacy Policy | ${siteConfig.name}`,
  description:
    `Privacy Policy for ${siteConfig.name} - Learn how we collect, use, and protect your data on our crypto intelligence platform.`,
  alternates: {
    canonical: "/privacy",
  },
};

const toc: TOCItem[] = [
  { id: "information-collected", title: "1. Information We Collect" },
  { id: "information-not-collected", title: "2. Information We Do Not Collect" },
  { id: "cookies", title: "3. Cookies and Tracking Technologies" },
  { id: "analytics", title: "4. Analytics" },
  { id: "security", title: "5. Security" },
  { id: "data-retention", title: "6. Data Retention" },
  { id: "third-party", title: "7. Third-Party Services" },
  { id: "user-rights", title: "8. Your Rights" },
  { id: "contact", title: "9. Contact Us" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="Your privacy is important to us. This policy explains how we handle your data."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <p>
        This Privacy Policy describes how Kelucalls (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) collects, uses, and protects information when you use our
        platform. By using Kelucalls, you agree to the collection and use of
        information in accordance with this policy.
      </p>

      <h2 id="information-collected">1. Information We Collect</h2>
      <p>We collect the following types of information:</p>
      <h3>Information You Provide</h3>
      <ul>
        <li>
          <strong>Contact Information:</strong> When you contact us, we may collect
          your name, email address, and any other information you provide in your
          message.
        </li>
        <li>
          <strong>Channel Submission Information:</strong> When submitting a Telegram
          channel, we collect channel details including name, handle, description,
          and owner verification information.
        </li>
        <li>
          <strong>Advertising Information:</strong> For advertisers, we collect
          business information necessary for campaign management.
        </li>
      </ul>

      <h3>Automatically Collected Information</h3>
      <ul>
        <li>
          <strong>Usage Data:</strong> We collect information about how you interact
          with the Platform, including pages visited, time spent, and features
          used.
        </li>
        <li>
          <strong>Device Information:</strong> We collect device type, browser type,
          operating system, and similar technical information.
        </li>
        <li>
          <strong>IP Address:</strong> We may collect IP addresses for security
          purposes and analytics.
        </li>
      </ul>

      <h2 id="information-not-collected">2. Information We Do Not Collect</h2>
      <Callout variant="warning" title="We Never Request">
        Kelucalls will NEVER ask you for any of the following:
      </Callout>
      <ul>
        <li>
          <strong>Crypto Wallet Seed Phrases:</strong> We never request, collect, or
          store wallet seed phrases, private keys, or recovery phrases.
        </li>
        <li>
          <strong>Passwords:</strong> We never ask for your passwords, whether for
          exchanges, wallets, or Telegram accounts.
        </li>
        <li>
          <strong>Private Telegram Messages:</strong> We do not collect or access
          private Telegram messages. We only track public channel content.
        </li>
        <li>
          <strong>Financial Account Credentials:</strong> We never request login
          credentials for exchanges, banks, or financial services.
        </li>
      </ul>

      <h2 id="cookies">3. Cookies and Tracking Technologies</h2>
      <p>
        We use cookies and similar tracking technologies to enhance your experience
        on our Platform. For detailed information about the cookies we use, please
        see our{" "}
        <a href="/cookies" className="text-cyan-400 hover:underline">
          Cookie Policy
        </a>
        .
      </p>
      <p>
        You can control or disable cookies through your browser settings. Please
        note that disabling cookies may affect the functionality of the Platform.
      </p>

      <h2 id="analytics">4. Analytics</h2>
      <p>
        We use third-party analytics services to understand how users interact with
        our Platform. These services may collect information about your browsing
        behavior. We use this data to improve our services and user experience.
      </p>

      <h2 id="security">5. Security</h2>
      <p>
        We implement appropriate technical and organizational measures to protect
        your personal information against unauthorized access, alteration,
        disclosure, or destruction. However, no method of transmission over the
        Internet or electronic storage is 100% secure, and we cannot guarantee
        absolute security.
      </p>

      <h2 id="data-retention">6. Data Retention</h2>
      <p>
        We retain personal information only for as long as necessary to fulfill the
        purposes outlined in this Privacy Policy. Usage data and analytics
        information may be retained for longer periods for security and
        improvement purposes.
      </p>

      <h2 id="third-party">7. Third-Party Services</h2>
      <p>
        Our Platform may contain links to third-party websites or services. We are
        not responsible for the privacy practices of these third parties. We
        encourage you to review the privacy policies of any third-party services
        you access.
      </p>

      <h2 id="user-rights">8. Your Rights</h2>
      <p>Depending on your location, you may have the following rights:</p>
      <ul>
        <li>
          <strong>Access:</strong> Request a copy of the personal information we
          hold about you.
        </li>
        <li>
          <strong>Correction:</strong> Request correction of inaccurate personal
          information.
        </li>
        <li>
          <strong>Deletion:</strong> Request deletion of your personal information.
        </li>
        <li>
          <strong>Opt-Out:</strong> Opt-out of certain data collection, including
          analytics and cookies.
        </li>
      </ul>
      <p>
        To exercise these rights, please contact us at{" "}
        <a href={mailto("privacy")} className="text-cyan-400 hover:underline">
          {siteConfig.email.privacy}
        </a>
        .
      </p>

      <h2 id="contact">9. Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy, please contact us at{" "}
        <a href={mailto("privacy")} className="text-cyan-400 hover:underline">
          {siteConfig.email.privacy}
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