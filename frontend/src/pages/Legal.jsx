// frontend/src/pages/Legal.jsx — privacy policy and terms of service.
// Linked from Google's sign-in consent screen, the footer and the sign-up pages.
import React from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

const CONTACT = 'ashutoshabhinavbachra0009@gmail.com';
const UPDATED = '10 November 2026';

function Shell({ title, children }) {
  return (
    <div className="min-h-screen bg-[#05060f] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-white">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600">
            <Zap size={18} />
          </span>
          <span className="font-display font-semibold">Universal API Hub</span>
        </Link>
        <article className="mt-10 text-slate-300 leading-relaxed [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5 [&_p]:mt-3 [&_a]:text-brand-400 [&_a]:underline">
          <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
          <p className="!mt-2 text-sm text-slate-500">Last updated {UPDATED}</p>
          {children}
        </article>
        <p className="mt-12 flex gap-5 text-sm">
          <Link to="/" className="text-brand-400 hover:text-brand-300">Home</Link>
          <Link to="/privacy" className="text-brand-400 hover:text-brand-300">Privacy</Link>
          <Link to="/terms" className="text-brand-400 hover:text-brand-300">Terms</Link>
          <Link to="/refunds" className="text-brand-400 hover:text-brand-300">Refunds</Link>
          <Link to="/contact" className="text-brand-400 hover:text-brand-300">Contact</Link>
        </p>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy policy">
      <p className="!mt-8">
        Universal API Hub is a StrattonTrade product built by Abhinav Ashutosh. It gives developers one API key for
        many data and AI APIs. This page explains what we store and why. We don&rsquo;t sell your data or use it for
        advertising.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> email address, username, and a hashed password (we never see the password itself).</li>
        <li>
          <strong>If you sign in with Google:</strong> only your email address and Google&rsquo;s account ID for you. We don&rsquo;t
          get your Google password, contacts, files or anything else from your Google account.
        </li>
        <li><strong>API keys:</strong> stored only as hashes; the full key is shown to you once when it&rsquo;s created.</li>
        <li>
          <strong>Usage logs:</strong> for each API call, the endpoint, time, status, response time, IP address and user
          agent. They power your usage dashboard, rate limits and abuse prevention.
        </li>
        <li><strong>AI credits:</strong> your credit balance and a record of each top-up and each paid AI call (time, endpoint, model, amount).</li>
        <li><strong>Billing:</strong> if you buy a plan or credits, Razorpay handles the payment. We keep the plan, amount, date and Razorpay&rsquo;s order and payment IDs, never your card, UPI or bank details.</li>
        <li><strong>Visit statistics:</strong> Vercel Web Analytics counts page views and visitors to this website without cookies and without storing personal information.</li>
      </ul>

      <h2>Who else handles it</h2>
      <ul>
        <li>Our hosting providers (Render for the servers, Vercel for the website) and our database host store the data above.</li>
        <li>The data providers behind each API (market data, news, weather, sports, AI models) receive the queries you send through them, such as a stock symbol, a city or a prompt. They don&rsquo;t receive your account details.</li>
        <li>Razorpay processes payments. Google handles &ldquo;Sign in with Google&rdquo; if you use it.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>If a key leaks, email us and we&rsquo;ll revoke it.</li>
        <li>You can ask us to delete your account and its data, or for a copy of it, by emailing <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Passwords and API keys are stored as hashes, and everything travels over HTTPS. No system is perfectly secure,
        so keep your API keys secret and tell us straight away if one leaks.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. If this policy changes, the date at the top changes too.
      </p>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of service">
      <p className="!mt-8">
        These terms cover your use of Universal API Hub, a StrattonTrade product built by Abhinav Ashutosh. By creating
        an account or using an API key, you agree to them.
      </p>

      <h2>Your account and keys</h2>
      <ul>
        <li>Keep your sign-in details and API keys secret. You are responsible for calls made with your keys.</li>
        <li>Stay within your plan&rsquo;s rate limits. Don&rsquo;t try to get around them, for example with many accounts.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Don&rsquo;t use the service to break the law, to send spam, to attack other systems, or to resell raw access
        to the underlying data providers. We may suspend keys or accounts that do.
      </p>

      <h2>Data and AI answers</h2>
      <p>
        Data comes from third-party providers and can be delayed, incomplete or wrong. AI answers can be wrong too.
        Nothing from the service is financial, investment, legal or medical advice; check important information
        yourself before acting on it.
      </p>

      <h2>Plans and payments</h2>
      <p>
        Paid plans are paid in advance through Razorpay, in Indian rupees, for 30 days at a time. They don&rsquo;t
        renew automatically: when the 30 days end, your account moves back to the free plan unless you pay again.
        Paying again before the end adds 30 more days. Prices may change, but never for time you have already paid
        for. If a payment went through but your plan didn&rsquo;t change, email us with the payment ID.
      </p>

      <h2>AI credits</h2>
      <p>
        Paid AI models are paid for with prepaid credits. Each call is charged at what the AI provider charged for it,
        converted to rupees, plus a service fee; free models cost nothing. The amount appears in your dashboard and in
        the <code>X-Cost-INR</code> response header. Credits don&rsquo;t expire. A call that is already running may take
        your balance slightly below zero; paid models then stop until you add credits.
      </p>

      <h2>The service</h2>
      <p>
        Universal API Hub is provided &ldquo;as is&rdquo;, without any guarantee that it will always be available or
        error-free, and endpoints may change. To the extent the law allows, we are not liable for losses that come
        from using it.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. If these terms change, the date at the top changes too. See also
        the <Link to="/privacy">privacy policy</Link>.
      </p>
    </Shell>
  );
}

export function Refunds() {
  return (
    <Shell title="Cancellation, refunds and delivery">
      <p className="!mt-8">
        Universal API Hub sells access to paid plans (Pro and Premium) for 30 days at a time, and prepaid AI credits,
        both paid in advance in Indian rupees through Razorpay.
      </p>

      <h2>Delivery</h2>
      <p>
        This is a digital service; nothing is shipped. Your plan starts as soon as the payment is confirmed, usually
        within a few seconds, and the dashboard shows the date it ends. If your plan hasn&rsquo;t changed 30 minutes
        after paying, email us with your Razorpay payment ID.
      </p>

      <h2>Cancellation</h2>
      <p>
        Plans don&rsquo;t renew automatically, so there is nothing to cancel: when the 30 days end, your account moves
        back to the free plan unless you pay again. You can also switch to the free plan at any time from the
        dashboard; the unused days are not carried over.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li><strong>Charged but the plan didn&rsquo;t start, or charged twice:</strong> full refund of the payment that didn&rsquo;t give you a plan.</li>
        <li><strong>Not happy with the service:</strong> ask within 7 days of paying for a full refund. Your account then moves back to the free plan.</li>
        <li>After 7 days, payments for the current 30-day period aren&rsquo;t refunded.</li>
        <li><strong>AI credits:</strong> unused credits from a top-up can be refunded within 7 days of buying them; credits already spent on AI calls can&rsquo;t.</li>
        <li>Refunds are made through Razorpay to the same card, UPI or bank account you paid with, usually within 5–7 working days of approval.</li>
      </ul>
      <p>
        To ask for a refund, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from your account&rsquo;s email address
        with the Razorpay payment ID. We reply within 2 working days.
      </p>
    </Shell>
  );
}

export function Contact() {
  return (
    <Shell title="Contact us">
      <p className="!mt-8">Questions about your account, payments, refunds or the API? Get in touch.</p>
      <h2>Email</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> — we reply within 2 working days. For payment issues, include
        your Razorpay payment ID.
      </p>
      <h2>Business</h2>
      <p>
        Universal API Hub is a StrattonTrade product, run by Abhinav Ashutosh.
        <br />
        Bhubaneswar, Odisha, India
      </p>
    </Shell>
  );
}
