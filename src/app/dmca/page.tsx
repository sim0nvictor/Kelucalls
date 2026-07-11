import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";
export const metadata: Metadata = {
  title: "DMCA | Kelucalls",
  description:
    "DMCA Copyright Removal Request - Submit copyright infringement notices to Kelucalls.",
  alternates: {
    canonical: "/dmca",
  },
};

const toc: TOCItem[] = [
  { id: "overview", title: "Overview" },
  { id: "notice", title: "Copyright Infringement Notice" },
  { id: "counter", title: "Counter-Notice" },
  { id: "contact", title: "Contact" },
];

export default function DMCAPage() {
  return (
    <LegalLayout
      title="DMCA Policy"
      description="Our policy for handling copyright infringement notices."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <h2 id="overview">Overview</h2>
      <p>
        Kelucalls respects intellectual property rights and expects our users to do
        the same. This page outlines our procedures for handling copyright
        infringement notices under the Digital Millennium Copyright Act (DMCA).
      </p>

      <Callout variant="info" title="Third-Party Content">
        Kelucalls aggregates content from third-party Telegram channels. We are
        not responsible for content posted by channel creators on their own
        channels.
      </Callout>

      <h2 id="notice">Copyright Infringement Notice</h2>
      <p>
        If you believe your copyrighted work has been infringed on Kelucalls, please
        submit a DMCA notice to our designated agent. Your notice must include:
      </p>

      <h3>Required Information</h3>
      <ol>
        <li>
          <strong>Identification of Copyrighted Work:</strong> Describe the
          copyrighted work you claim has been infringed. Include the type of work
          (e.g., text, image, video) and where it was originally published.
        </li>
        <li>
          <strong>Description of Infringement:</strong> Explain what content you
          believe is infringing and where it appears on our Platform.
        </li>
        <li>
          <strong>URL(s):</strong> Provide the specific URL(s) where the allegedly
          infringing content is located.
        </li>
        <li>
          <strong>Contact Information:</strong> Provide your name, address,
          telephone number, and email address.
        </li>
        <li>
          <strong>Good Faith Statement:</strong> Include a statement that you have
          a good faith belief that the disputed use is not authorized by the
          copyright owner, its agent, or the law.
        </li>
        <li>
          <strong>Accuracy Statement:</strong> Include a statement that the
          information in your notice is accurate and, under penalty of perjury,
          that you are the copyright owner or authorized to act on the owner&apos;s
          behalf.
        </li>
        <li>
          <strong>Signature:</strong> Include your physical or electronic
          signature.
        </li>
      </ol>

      <h3>Where to Send</h3>
      <p>
        Send your DMCA notice to our designated agent at:{" "}
        <a href="mailto:dmca@kelucalls.com" className="text-cyan-400 hover:underline">
          dmca@kelucalls.com
        </a>
      </p>

      <Callout variant="warning" title="Important">
        Perjury is a serious offense. False claims may result in legal liability.
        If you are unsure whether your copyright has been infringed, consult an
        attorney before submitting a notice.
      </Callout>

      <h2 id="counter">Counter-Notice</h2>
      <p>
        If you believe your content was removed or disabled due to a mistake or
        misidentification, you may submit a counter-notice. Your counter-notice
        must include:
      </p>
      <ol>
        <li>
          Identification of the material that has been removed or disabled
        </li>
        <li>
          The location of the material before it was removed (URL)
        </li>
        <li>
          A statement under penalty of perjury that you have a good faith belief
          the material was removed due to mistake or misidentification
        </li>
        <li>Your name, address, and telephone number</li>
        <li>A statement that you consent to the jurisdiction of the Federal</li>
        <li>Your physical or electronic signature</li>
      </ol>
      <p>
        Counter-notices should be sent to{" "}
        <a href="mailto:dmca@kelucalls.com" className="text-cyan-400 hover:underline">
          dmca@kelucalls.com
        </a>
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        For DMCA-related questions, please contact us at{" "}
        <a href="mailto:dmca@kelucalls.com" className="text-cyan-400 hover:underline">
          dmca@kelucalls.com
        </a>
      </p>
    </LegalLayout>
  );
}