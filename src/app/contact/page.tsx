import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Contact | Kelucalls",
  description:
    "Get in touch with the Kelucalls team for partnerships, support, press, or general questions.",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  return (
    <LegalLayout
      title="Contact"
      description="Reach the Kelucalls team for support, partnerships, or general inquiries."
      lastUpdated="July 11, 2026"
    >
      <div className="space-y-6">
        <p className="text-base leading-8 text-slate-300">
          Whether you are a crypto community, a partner, a media outlet, or a user
          with a question, the Kelucalls team is here to help.
        </p>

        <Card className="border-white/10 bg-slate-950/70">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Get in touch</h2>
            <ul className="space-y-3 text-sm text-slate-300">
              <li>
                <span className="font-medium text-white">Support:</span>{" "}
                Use the contact form or reach out through the channels listed on the site.
              </li>
              <li>
                <span className="font-medium text-white">Partnerships:</span>{" "}
                For sponsorships, integrations, and promotional opportunities, contact the
                team directly.
              </li>
              <li>
                <span className="font-medium text-white">Press:</span>{" "}
                Media inquiries can be directed to the Kelucalls team for interviews or
                product information.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </LegalLayout>
  );
}