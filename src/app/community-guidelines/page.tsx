import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";

export const metadata: Metadata = {
  title: "Community Guidelines | Kelucalls",
  description:
    "Community Guidelines for Kelucalls - Understanding acceptable behavior and prohibited activities on our platform.",
  alternates: {
    canonical: "/community-guidelines",
  },
};

const toc: TOCItem[] = [
  { id: "overview", title: "Overview" },
  { id: "acceptable", title: "Acceptable Behavior" },
  { id: "prohibited", title: "Prohibited Activities" },
  { id: "enforcement", title: "Enforcement" },
  { id: "reporting", title: "Reporting Violations" },
  { id: "contact", title: "Contact" },
];

export default function CommunityGuidelinesPage() {
  return (
    <LegalLayout
      title="Community Guidelines"
      description="Our community standards for maintaining a trustworthy crypto intelligence platform."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <h2 id="overview">Overview</h2>
      <p>
        Kelucalls is built on trust, transparency, and integrity. These Community
        Guidelines outline the standards we expect from channel owners,
        advertisers, and users who interact with our Platform. By using Kelucalls,
        you agree to follow these guidelines.
      </p>

      <h2 id="acceptable">Acceptable Behavior</h2>
      <p>We encourage the following behaviors:</p>
      <ul>
        <li>
          <strong>Transparency:</strong> Be honest about your channel&apos;s performance,
          including both wins and losses.
        </li>
        <li>
          <strong>Accurate Reporting:</strong> Provide truthful, verifiable
          information in all submissions and communications.
        </li>
        <li>
          <strong>Quality Content:</strong> Create and share valuable, informative
          content that helps users make informed decisions.
        </li>
        <li>
          <strong>Respectful Interaction:</strong> Treat other users, channel
          owners, and our team with respect and professionalism.
        </li>
        <li>
          <strong>Legal Compliance:</strong> Ensure all activities comply with
          applicable laws and regulations.
        </li>
        <li>
          <strong>Constructive Feedback:</strong> Provide helpful feedback and
          suggestions for improving the Platform.
        </li>
      </ul>

      <h2 id="prohibited">Prohibited Activities</h2>
      <Callout variant="warning" title="Zero Tolerance">
        The following activities will result in immediate removal from the
        Platform and may be reported to authorities.
      </Callout>

      <h3>Spam and Manipulation</h3>
      <ul>
        <li>
          <strong>Spam:</strong> Repeatedly posting irrelevant or promotional content
        </li>
        <li>
          <strong>Fake Calls:</strong> Creating or promoting fabricated trading
          signals that never actually occurred
        </li>
        <li>
          <strong>Statute Manipulation:</strong> Artificially inflating call
          performance through coordinated activities or false data
        </li>
        <li>
          <strong>Rankings Manipulation:</strong> Attempting to artificially
          improve rankings through deceptive practices
        </li>
      </ul>

      <h3>Fraud and Deception</h3>
      <ul>
        <li>
          <strong>Impersonation:</strong> Pretending to be another channel, brand,
          or individual
        </li>
        <li>
          <strong>Fraud:</strong> Any activity designed to deceive users for
          financial gain
        </li>
        <li>
          <strong>Fake Airdrops:</strong> Promoting fake token airdrops or rewards
        </li>
        <li>
          <strong>Pump and Dump:</strong> Promoting schemes designed to
          artificially inflate prices for personal gain
        </li>
      </ul>

      <h3>Abuse and Harassment</h3>
      <ul>
        <li>
          <strong>Harassment:</strong> Targeted abuse toward individuals or groups
        </li>
        <li>
          <strong>Hate Speech:</strong> Content promoting violence or hatred based
          on protected characteristics
        </li>
        <li>
          <strong>Threats:</strong> Making threats of violence or harm
        </li>
        <li>
          <strong>Doxxing:</strong> Publishing private information about others
          without consent
        </li>
      </ul>

      <h3>Submission Abuse</h3>
      <ul>
        <li>
          <strong>False Information:</strong> Submitting channels with misleading or
          false information
        </li>
        <li>
          <strong>Unauthorized Ownership:</strong> Submitting channels you do not
          own or represent
        </li>
        <li>
          <strong>Duplicate Submissions:</strong> Submitting the same channel
          multiple times
        </li>
        <li>
          <strong>Review Manipulation:</strong> Attempting to influence our
          review process through inappropriate means
        </li>
      </ul>

      <h2 id="enforcement">Enforcement</h2>
      <p>
        We take violations of these guidelines seriously. Depending on the severity
        and frequency of violations, we may take the following actions:
      </p>
      <ul>
        <li>
          <strong>Warning:</strong> Issue a formal warning for minor violations
        </li>
        <li>
          <strong>Content Removal:</strong> Remove violating content from the
          Platform
        </li>
        <li>
          <strong>Ranking Penalty:</strong> Apply penalties to rankings or remove
          from listings
        </li>
        <li>
          <strong>Account Suspension:</strong> Temporarily suspend access to the
          Platform
        </li>
        <li>
          <strong>Permanent Removal:</strong> Permanently remove channels or users
          from the Platform
        </li>
        <li>
          <strong>Legal Action:</strong> Pursue legal action when required
        </li>
      </ul>

      <h2 id="reporting">Reporting Violations</h2>
      <p>
        If you witness violations of these Community Guidelines, please report
        them to us. You can report through:
      </p>
      <ul>
        <li>
          Our <a href="/contact" className="text-cyan-400 hover:underline">contact form</a>
        </li>
        <li>
          Email:{" "}
          <a href="mailto:safety@kelucalls.com" className="text-cyan-400 hover:underline">
            safety@kelucalls.com
          </a>
        </li>
      </ul>
      <p>
        When reporting, please provide as much detail as possible, including
        relevant links, screenshots, and descriptions.
      </p>

      <h2 id="contact">Questions</h2>
      <p>
        If you have questions about these Community Guidelines, please contact us
        at{" "}
        <a href="mailto:support@kelucalls.com" className="text-cyan-400 hover:underline">
          support@kelucalls.com
        </a>
        .
      </p>
    </LegalLayout>
  );
}