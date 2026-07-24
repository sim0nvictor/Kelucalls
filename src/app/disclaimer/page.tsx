import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { Callout } from "@/components/ui/callout";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { siteConfig, mailto } from "@/config/site";

export const metadata: Metadata = {
  title: `Disclaimer | ${siteConfig.name}`,
  description:
    `Important disclaimer about using ${siteConfig.name} - Understand the risks associated with cryptocurrency trading signals.`,
  alternates: {
    canonical: "/disclaimer",
  },
};

export default function DisclaimerPage() {
  return (
    <LegalLayout
      title="Disclaimer"
      description="Important information about the use of Kelucalls and cryptocurrency trading."
      lastUpdated="July 11, 2026"
    >
      <Callout variant="error" title="Risk Warning">
        Cryptocurrency trading involves significant risk. You can lose your entire
        investment. Kelucalls is for informational purposes only.
      </Callout>

      <h2 id="no-investment-advice">1. No Investment Advice</h2>
      <p>
        Kelucalls does not provide investment advice, financial advice, or any form
        of professional trading advice. The information provided on our Platform
        is for informational and educational purposes only. Nothing on Kelucalls
        should be construed as a recommendation to buy, sell, hold, or avoid any
        cryptocurrency.
      </p>
      <p>
        You should consult with a qualified financial advisor before making any
        investment decisions. Your financial situation is unique, and what works for
        others may not be appropriate for you.
      </p>

      <h2 id="crypto-risks">2. Cryptocurrency Risks</h2>
      <div className="not-prose my-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-red-400/20 text-red-400">
              <TrendingDown className="size-5" />
            </div>
            <h3 className="font-semibold text-white">Total Loss Possible</h3>
          </div>
          <p className="text-sm text-slate-400">
            The value of cryptocurrencies can drop to zero. Never invest more than
            you can afford to lose entirely.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-400/20 text-amber-400">
              <AlertTriangle className="size-5" />
            </div>
            <h3 className="font-semibold text-white">Extreme Volatility</h3>
          </div>
          <p className="text-sm text-slate-400">
            Crypto markets are highly volatile. Prices can move dramatically in
            minutes.
          </p>
        </div>
      </div>

      <h2 id="market-volatility">3. Market Volatility</h2>
      <p>
        Cryptocurrency markets are known for extreme volatility. Prices can surge
        or crash based on various factors including:
      </p>
      <ul>
        <li>Market sentiment and speculation</li>
        <li>Regulatory announcements</li>
        <li>Security incidents and hacks</li>
        <li>Technological changes</li>
        <li>Whale activity and market manipulation</li>
      </ul>
      <p>
        Historical performance does not predict future results. A channel&apos;s past
        success does not guarantee future performance.
      </p>

      <h2 id="data-limitations">4. Data Limitations</h2>
      <Callout variant="warning" title="Data Accuracy">
        Our data has limitations. Always verify information independently.
      </Callout>
      <p>
        While we strive for accuracy, our data has inherent limitations:
      </p>
      <ul>
        <li>
          <strong>Verification Challenges:</strong> Not all calls can be verified as
          hitting price targets due to unclear parameters or deleted messages.
        </li>
        <li>
          <strong>Delayed Data:</strong> There may be delays in tracking and
          verifying calls.
        </li>
        <li>
          <strong>Self-Reporting Bias:</strong> Channels may selectively highlight
          wins and remove or edit losing calls.
        </li>
        <li>
          <strong>Incomplete Coverage:</strong> We cannot track every crypto signal
          channel.
        </li>
      </ul>

      <h2 id="third-party">5. Third-Party Information</h2>
      <p>
        Kelucalls aggregates information from third-party Telegram channels. We do
        not control, endorse, or verify the accuracy of content posted by these
        channels. The views and opinions expressed by channel creators are their
        own and do not reflect Kelucalls&apos; views.
      </p>
      <p>
        Before following any signal, you should:
      </p>
      <ul>
        <li>Verify the channel&apos;s track record independently</li>
        <li>Understand the entry and exit conditions</li>
        <li>Assess your own risk tolerance</li>
        <li>Conduct your own research</li>
      </ul>

      <h2 id="no-guarantee">6. No Guarantee of Profits</h2>
      <Callout variant="error" title="No Guarantees">
        Kelucalls does not guarantee profits or specific outcomes from following any
        channel or signal.
      </Callout>
      <p>
        Even channels with excellent historical performance can produce losing
        trades. Past results do not guarantee future performance. The
        cryptocurrency market is unpredictable, and there are no guarantees of
        profit.
      </p>

      <h2 id="your-responsibility">7. Your Responsibility</h2>
      <p>
        Using Kelucalls, you acknowledge that:
      </p>
      <ul>
        <li>You are solely responsible for your investment decisions</li>
        <li>You understand the risks associated with cryptocurrency trading</li>
        <li>You will conduct your own research before making trades</li>
        <li>You will only use funds you can afford to lose</li>
        <li>You comply with applicable laws in your jurisdiction</li>
      </ul>

      <h2 id="contact">8. Questions</h2>
      <p>
        If you have questions about this disclaimer, please contact us at{" "}
        <a href={mailto("support")} className="text-cyan-400 hover:underline">
          {siteConfig.email.support}
        </a>
        .
      </p>
    </LegalLayout>
  );
}