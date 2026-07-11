import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";

export const metadata: Metadata = {
  title: "Listing Policy | Kelucalls",
  description:
    "Listing Policy for Kelucalls - Learn about channel eligibility, submission requirements, and review processes.",
  alternates: {
    canonical: "/listing-policy",
  },
};

const toc: TOCItem[] = [
  { id: "overview", title: "Overview" },
  { id: "eligibility", title: "Eligibility Requirements" },
  { id: "submission", title: "Submission Process" },
  { id: "review", title: "Review Process" },
  { id: "verification", title: "Verification" },
  { id: "updates", title: "Updating Channel Information" },
  { id: "removal", title: "Removal Requests" },
  { id: "rejection", title: "Rejection Appeals" },
  { id: "contact", title: "Contact" },
];

export default function ListingPolicyPage() {
  return (
    <LegalLayout
      title="Listing Policy"
      description="Guidelines for listing Telegram crypto signal channels on Kelucalls."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <h2 id="overview">Overview</h2>
      <p>
        This Listing Policy explains the requirements and procedures for having
        your Telegram crypto channel listed on Kelucalls. We aim to maintain a
        high-quality, transparent directory of crypto signal channels to help
        users make informed decisions.
      </p>

      <h2 id="eligibility">Eligibility Requirements</h2>
      <p>To be eligible for listing on Kelucalls, a channel must meet the following criteria:</p>

      <h3>Channel Requirements</h3>
      <ul>
        <li>
          <strong>Public Channel:</strong> Must be a public Telegram channel
          (private channels cannot be tracked)
        </li>
        <li>
          <strong>Minimum Activity:</strong> Must have posted at least 30 verified
          crypto trading signals in the past 90 days
        </li>
        <li>
          <strong>Focus:</strong> Primary focus must be on cryptocurrency trading
          signals, market analysis, or related educational content
        </li>
        <li>
          <strong>Language:</strong> Must be in English or have English
          translations available
        </li>
        <li>
          <strong>Age:</strong> Channel must be at least 30 days old
        </li>
      </ul>

      <h3>Content Requirements</h3>
      <ul>
        <li>
          <strong>Original Content:</strong> Must post original analysis or signals
          (reposting others&apos; content without attribution is not sufficient)
        </li>
        <li>
          <strong>Verifiable Calls:</strong> Must provide clear entry points,
          price targets, and timeframes for calls
        </li>
        <li>
          <strong>Transparency:</strong> Must accurately represent performance and
          avoid misleading claims
        </li>
        <li>
          <strong>No Prohibited Content:</strong> Must not contain content that
          violates our Community Guidelines
        </li>
      </ul>

      <h2 id="submission">Submission Process</h2>
      <p>To submit your channel for listing:</p>
      <ol>
        <li>Visit our contact page and select &quot;Channel Submission&quot;</li>
        <li>Provide your channel name and Telegram handle</li>
        <li>Include a brief description of your channel</li>
        <li>Share information about your track record</li>
        <li>Provide proof of ownership (if requesting verification)</li>
        <li>Submit and await review</li>
      </ol>

      <h2 id="review">Review Process</h2>
      <p>
        All submissions undergo a review process to ensure quality and accuracy.
        Our team evaluates:
      </p>
      <ul>
        <li>Eligibility against our requirements</li>
        <li>Quality and consistency of signals</li>
        <li>Accuracy of claimed performance</li>
        <li>Compliance with Community Guidelines</li>
      </ul>
      <p>
        The review process typically takes 5-10 business days. We may reach out
        for additional information during this time.
      </p>

      <Callout variant="info" title="No Fees">
        Kelucalls does not charge fees for channel listings. Organic rankings are
        determined solely by performance data.
      </Callout>

      <h2 id="verification">Verification</h2>
      <p>
        Channel owners can request verification to receive a blue checkmark badge.
        To be verified, you must:
      </p>
      <ul>
        <li>Confirm ownership of the channel through Telegram</li>
        <li>Provide official contact information</li>
        <li>Meet all eligibility requirements</li>
        <li>Agree to our terms and policies</li>
      </ul>
      <p>
        Verified channels receive priority in review processes and may be eligible
        for additional features.
      </p>

      <h2 id="updates">Updating Channel Information</h2>
      <p>
        Channel owners can request updates to their channel information, including:
      </p>
      <ul>
        <li>Channel name and handle</li>
        <li>Description and category</li>
        <li>Contact information</li>
        <li>Website and social media links</li>
      </ul>
      <p>
        To request updates, please contact us with your channel details and
        ownership verification.
      </p>

      <h2 id="removal">Removal Requests</h2>
      <p>
        Channel owners may request removal of their channel from Kelucalls at any
        time. To request removal:
      </p>
      <ol>
        <li>Contact us through our contact form</li>
        <li>Provide your channel name and handle</li>
        <li>Verify ownership</li>
        <li>Specify &quot;Removal Request&quot; as the subject</li>
      </ol>
      <p>
        We will process removal requests within 5-7 business days. Note that
        historical data may remain in our archives even after removal.
      </p>

      <h2 id="rejection">Rejection Appeals</h2>
      <p>
        If your channel submission is rejected, you may appeal the decision. Common
        reasons for rejection include:
      </p>
      <ul>
        <li>Insufficient activity or call volume</li>
        <li>Private channel (not accessible for tracking)</li>
        <li>Content that violates Community Guidelines</li>
        <li>Failure to provide required information</li>
        <li>Misleading or inaccurate claims</li>
      </ul>
      <p>
        To appeal, contact us with your channel details and a detailed explanation
        of why you believe the rejection was incorrect. Appeals are reviewed by our
        team within 10 business days.
      </p>

      <h2 id="contact">Questions</h2>
      <p>
        If you have questions about the listing process, please contact us at{" "}
        <a href="mailto:listings@kelucalls.com" className="text-cyan-400 hover:underline">
          listings@kelucalls.com
        </a>
        .
      </p>
    </LegalLayout>
  );
}