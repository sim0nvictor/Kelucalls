import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";

export const metadata: Metadata = {
  title: "Terms and Conditions | Kelucalls",
  description:
    "Terms and Conditions for Kelucalls - Understanding the rules and guidelines for using our crypto intelligence platform.",
  alternates: {
    canonical: "/terms",
  },
};

const toc: TOCItem[] = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "purpose", title: "2. Platform Purpose" },
  { id: "responsibilities", title: "3. User Responsibilities" },
  { id: "no-financial-advice", title: "4. No Financial Advice" },
  { id: "data-accuracy", title: "5. Data Accuracy" },
  { id: "rankings", title: "6. Rankings" },
  { id: "sponsored-content", title: "7. Sponsored Content" },
  { id: "intellectual-property", title: "8. Intellectual Property" },
  { id: "limitation-liability", title: "9. Limitation of Liability" },
  { id: "account-termination", title: "10. Account Termination" },
  { id: "governing-law", title: "11. Governing Law" },
  { id: "contact", title: "12. Contact Information" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms and Conditions"
      description="These terms govern your use of the Kelucalls platform. Please read them carefully."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <h2 id="acceptance">1. Acceptance of Terms</h2>
      <p>
        By accessing and using Kelucalls (&quot;the Platform&quot;), you accept and
        agree to be bound by the terms and provisions of this agreement. If you do
        not agree to these terms, please do not use the Platform.
      </p>

      <h2 id="purpose">2. Platform Purpose</h2>
      <p>
        Kelucalls is a crypto intelligence platform that tracks, analyzes, and
        ranks Telegram crypto signal channels. The Platform provides historical
        performance data, rankings, and analytics to help users evaluate crypto
        signal providers. The Platform does not execute trades, manage portfolios,
        or provide personalized investment advice.
      </p>

      <h2 id="responsibilities">3. User Responsibilities</h2>
      <p>When using Kelucalls, you agree to:</p>
      <ul>
        <li>
          Use the Platform only for lawful purposes and in accordance with these
          Terms
        </li>
        <li>
          Not attempt to manipulate, interfere with, or damage the Platform or its
          underlying systems
        </li>
        <li>
          Not use the Platform to promote or facilitate illegal activities,
          including fraud, scams, or market manipulation
        </li>
        <li>
          Respect the intellectual property rights of Kelucalls and third parties
        </li>
        <li>
          Provide accurate information when submitting channels or contacting
          support
        </li>
      </ul>

      <h2 id="no-financial-advice">4. No Financial Advice</h2>
      <Callout variant="warning" title="Important">
        Kelucalls does not provide investment advice, financial advice, or any
        form of professional trading advice. All information provided on the
        Platform is for informational and educational purposes only.
      </Callout>
      <p>
        Nothing on the Platform should be construed as investment advice or a
        recommendation to buy, sell, or trade any cryptocurrency. Past performance
        does not guarantee future results. Trading cryptocurrency involves
        significant risk, including the potential loss of your entire investment.
        You should consult with a qualified financial advisor before making any
        investment decisions.
      </p>

      <h2 id="data-accuracy">5. Data Accuracy</h2>
      <p>
        We strive to provide accurate data, but we cannot guarantee the accuracy,
        completeness, or reliability of all information on the Platform. Data
        may be delayed, inaccurate, or incomplete due to various factors
        including:
      </p>
      <ul>
        <li>Channels editing or deleting signal posts after publication</li>
        <li>Difficulty verifying whether signals hit their price targets</li>
        <li>Changes in token pricing or delistings from exchanges</li>
        <li>Technical issues with data collection and processing</li>
      </ul>
      <p>
        You should independently verify all information before making any
        investment decisions.
      </p>

      <h2 id="rankings">6. Rankings</h2>
      <p>
        Our rankings are generated algorithmically based on historical tracked
        call performance. Ranking factors include but are not limited to:
      </p>
      <ul>
        <li>Average Return on Investment (ROI)</li>
        <li>Win Rate (percentage of calls that hit targets)</li>
        <li>Consistency over time</li>
        <li>Total number of tracked calls</li>
        <li>Peak ROI achieved</li>
      </ul>
      <p>
        Rankings are determined by our proprietary algorithms and do not reflect
        editorial opinions or manual adjustments. We reserve the right to modify
        our ranking methodology at any time without notice.
      </p>

      <h2 id="sponsored-content">7. Sponsored Content</h2>
      <Callout variant="info" title="Transparency">
        Sponsored content on Kelucalls is always clearly labeled and never
        influences organic rankings. Advertisers cannot pay to improve their
        ranking positions.
      </Callout>
      <p>
        From time to time, we may display sponsored content, advertisements, or
        promoted channels on the Platform. Such content is clearly distinguished
        from organic rankings and is identified as &quot;Sponsored&quot; or
        &quot;Promoted.&quot; Sponsored content does not influence our ranking
        algorithms in any way.
      </p>

      <h2 id="intellectual-property">8. Intellectual Property</h2>
      <p>
        All content, features, and functionality of Kelucalls, including but not
        limited to the logo, design, text, graphics, and software, are owned by
        Kelucalls and are protected by copyright, trademark, and other intellectual
        property laws. You may not copy, modify, distribute, sell, or lease any
        part of the Platform without our prior written consent.
      </p>

      <h2 id="limitation-liability">9. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Kelucalls shall not be liable for
        any indirect, incidental, special, consequential, or punitive damages,
        including without limitation, loss of profits, data, use, goodwill, or
        other intangible losses, resulting from:
      </p>
      <ul>
        <li>Your use of or inability to use the Platform</li>
        <li>
          Any reliance on the accuracy, completeness, or usefulness of
          information on the Platform
        </li>
        <li>Any trading decisions made based on Platform information</li>
        <li>Unauthorized access to or use of our servers and/or personal data</li>
      </ul>

      <h2 id="account-termination">10. Account Termination</h2>
      <p>
        We reserve the right to terminate or suspend your access to the Platform
        at any time, without prior notice or liability, for any reason,
        including but not limited to breach of these Terms. Upon termination,
        your right to use the Platform will immediately cease.
      </p>

      <h2 id="governing-law">11. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with
        applicable laws, without regard to its conflict of law provisions. Any
        disputes arising under these Terms shall be resolved in accordance with
        applicable legal procedures.
      </p>

      <h2 id="contact">12. Contact Information</h2>
      <p>
        If you have any questions about these Terms, please contact us at{" "}
        <a href="mailto:support@kelucalls.com" className="text-cyan-400 hover:underline">
          support@kelucalls.com
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