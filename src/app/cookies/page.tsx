import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { TOCItem } from "@/components/ui/table-of-contents";
import { siteConfig, mailto } from "@/config/site";

export const metadata: Metadata = {
  title: `Cookie Policy | ${siteConfig.name}`,
  description:
    `Cookie Policy for ${siteConfig.name} - Learn about the cookies we use and how to manage them.`,
  alternates: {
    canonical: "/cookies",
  },
};

const toc: TOCItem[] = [
  { id: "what-are-cookies", title: "1. What Are Cookies" },
  { id: "how-we-use", title: "2. How We Use Cookies" },
  { id: "types", title: "3. Types of Cookies We Use" },
  { id: "managing", title: "4. Managing Cookies" },
  { id: "updates", title: "5. Updates to This Policy" },
  { id: "contact", title: "6. Contact Us" },
];

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      description="This policy explains the cookies we use and how you can manage them."
      lastUpdated="July 11, 2026"
      toc={toc}
    >
      <p>
        This Cookie Policy explains how Kelucalls (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) uses cookies and similar tracking technologies when you use our
        platform. By continuing to use Kelucalls, you agree to our use of cookies
        as described in this policy.
      </p>

      <h2 id="what-are-cookies">1. What Are Cookies</h2>
      <p>
        Cookies are small text files that are placed on your device when you visit a
        website. They help the website remember information about your visit, such
        as your preferred language and other settings. This can make your next visit
        easier and the site more useful to you.
      </p>

      <h2 id="how-we-use">2. How We Use Cookies</h2>
      <p>We use cookies for various purposes:</p>
      <ul>
        <li>
          <strong>Essential Cookies:</strong> Required for the Platform to function
          properly. These include cookies needed for navigation, access to secure
          areas, and remembering your preferences.
        </li>
        <li>
          <strong>Analytics Cookies:</strong> Help us understand how visitors
          interact with our Platform by collecting and reporting information
          anonymously.
        </li>
        <li>
          <strong>Preference Cookies:</strong> Allow the Platform to remember
          choices you make to provide a more personalized experience.
        </li>
        <li>
          <strong>Security Cookies:</strong> Used to detect and prevent security
          threats and fraudulent activity.
        </li>
      </ul>

      <h2 id="types">3. Types of Cookies We Use</h2>

      <h3>Essential Cookies</h3>
      <p>
        These cookies are necessary for the website to function and cannot be
        switched off in our systems. They are usually only set in response to
        actions made by you, such as:
      </p>
      <ul>
        <li>Logging into the Platform</li>
        <li>Submitting channel information</li>
        <li>Filling in forms</li>
      </ul>

      <h3>Analytics Cookies</h3>
      <p>
        We use third-party analytics providers to help us understand how users use
        the Platform. These cookies may track things like:
      </p>
      <ul>
        <li>Time spent on the Platform</li>
        <li>Pages visited</li>
        <li>Links clicked</li>
        <li>Error messages encountered</li>
      </ul>
      <Callout variant="info" title="Privacy">
        Analytics data is collected anonymously and does not identify you personally.
        We use this information to improve our Platform and user experience.
      </Callout>

      <h3>Preference Cookies</h3>
      <p>
        These cookies enable enhanced functionality and personalization, such as:
      </p>
      <ul>
        <li>Remembering your language preferences</li>
        <li>Storing your search history</li>
        <li>Customizing content based on your interests</li>
      </ul>

      <h3>Security Cookies</h3>
      <p>
        Security cookies help us identify and prevent security threats and
        fraudulent activity. They assist in:
      </p>
      <ul>
        <li>Detecting unauthorized access attempts</li>
        <li>Authenticating users</li>
        <li>Preventing spam and abuse</li>
      </ul>

      <h2 id="managing">4. Managing Cookies</h2>
      <p>You have the right to decide whether to accept or reject cookies.</p>

      <h3>Browser Settings</h3>
      <p>
        Most web browsers allow you to control cookies through their settings. You
        can:
      </p>
      <ul>
        <li>View what cookies are stored on your device</li>
        <li>Delete specific cookies or all cookies</li>
        <li>Block all cookies or certain types</li>
        <li>Set preferences for certain websites</li>
      </ul>

      <h3>Cookie Preferences</h3>
      <p>
        You can update your cookie preferences at any time by contacting us or by
        clearing your browser cookies.
      </p>

      <Callout variant="warning" title="Note">
        If you block essential cookies, some parts of our Platform may not work
        properly. This may affect your ability to use certain features.
      </Callout>

      <h2 id="updates">5. Updates to This Policy</h2>
      <p>
        We may update this Cookie Policy from time to time to reflect changes in our
        practices or for operational, legal, or regulatory reasons. We will post
        any changes on this page and update the &quot;Last Updated&quot; date at the
        top.
      </p>

      <h2 id="contact">6. Contact Us</h2>
      <p>
        If you have any questions about our use of cookies, please contact us at{" "}
        <a href={mailto("privacy")} className="text-cyan-400 hover:underline">
          {siteConfig.email.privacy}
        </a>
        .
      </p>
    </LegalLayout>
  );
}