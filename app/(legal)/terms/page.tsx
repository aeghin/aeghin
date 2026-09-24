import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions | Aeghin",
  description:
    "The terms that govern your use of Aeghin, including our SMS and text messaging program terms.",
};

export default function TermsPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
      <p className="text-sm">Last updated: September 24, 2026</p>

      <h2>1. Acceptance of These Terms</h2>
      <p>
        These Terms &amp; Conditions (&quot;Terms&quot;) govern your access to and use of Aeghin, the
        event planning and volunteer management platform operated at{" "}
        <a href="https://aeghin.com">https://aeghin.com</a> (the &quot;Service&quot;). By creating
        an account or using the Service, you agree to these Terms and to our{" "}
        <Link href="/privacy">Privacy Policy</Link>. If you use the Service on behalf of an
        organization, you represent that you have authority to accept these Terms for that
        organization. If you do not agree, do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        Aeghin helps organizations such as churches and nonprofits plan events, invite and manage
        members, assign volunteers to roles, track availability, build setlists, and send related
        notifications by email and text message.
      </p>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must be at least 13 years old to use the Service.</li>
        <li>You agree to provide accurate account information and keep it up to date.</li>
        <li>
          You are responsible for safeguarding your login credentials and for all activity under
          your account.
        </li>
        <li>
          Notify us immediately at <a href="mailto:support@aeghin.com">support@aeghin.com</a> if
          you suspect unauthorized use of your account.
        </li>
      </ul>

      <h2>4. Organizations, Members, and Invitations</h2>
      <ul>
        <li>
          Organization owners and administrators control their organization&apos;s membership,
          roles, events, and content.
        </li>
        <li>
          When you join an organization, your profile information and availability become visible
          to that organization as needed for scheduling.
        </li>
        <li>
          Members may invite others to join an organization by email or text message. When you
          invite someone, you confirm that you know them and reasonably believe they are willing
          to receive the invitation.
        </li>
        <li>
          We are not responsible for how organizations manage their members, events, or internal
          communications.
        </li>
      </ul>

      <h2>5. Your Content</h2>
      <p>
        You and your organizations retain ownership of the content you add to the Service, such as
        events, songs, setlists, and uploaded files (&quot;Content&quot;). You grant Aeghin a
        limited, non-exclusive license to host, store, process, and display Content solely to
        operate and improve the Service. You are responsible for your Content, including having
        the rights needed to upload and share it (for example, rights to song lyrics,
        arrangements, or files).
      </p>

      <h2>6. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
        <li>
          Send spam, unsolicited marketing, or messages to people who have not agreed to receive
          them.
        </li>
        <li>
          Upload content that is infringing, harmful, or deceptive, or that violates the rights of
          others.
        </li>
        <li>
          Attempt to probe, disrupt, reverse engineer, or gain unauthorized access to the Service
          or its systems.
        </li>
        <li>Misrepresent your identity or affiliation with any person or organization.</li>
      </ul>

      <h2>7. SMS / Text Messaging Terms</h2>
      <p>
        Aeghin offers text message notifications for things like organization invitations, event
        invitations and volunteer scheduling requests, event reminders, and updates about events
        or your account. By providing your mobile phone number and opting in, you consent to
        receive these messages from Aeghin. Consent is not a condition of using the Service or of any
        purchase.
      </p>
      <ol>
        <li>
          <strong>Canceling.</strong> You can cancel the SMS service at any time by texting{" "}
          <strong>STOP</strong>. After you send STOP, we will send a message confirming that you
          have been unsubscribed, and you will no longer receive SMS messages from us. To rejoin,
          opt in again through your account settings.
        </li>
        <li>
          <strong>Help.</strong> If you experience issues with the messaging program, reply{" "}
          <strong>HELP</strong> for assistance, or contact us directly at{" "}
          <a href="mailto:support@aeghin.com">support@aeghin.com</a>.
        </li>
        <li>
          <strong>Carriers.</strong> Carriers are not liable for delayed or undelivered messages.
        </li>
        <li>
          <strong>Rates and frequency.</strong> Message and data rates may apply for messages sent
          to you from us and from you to us. Message frequency varies based on your
          organization&apos;s activity and your notification settings. If you have questions about
          your text plan or data plan, contact your wireless provider.
        </li>
        <li>
          <strong>Privacy.</strong> If you have any questions regarding privacy, please read our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </li>
      </ol>

      <h2>8. Paid Features and Billing</h2>
      <ul>
        <li>
          Some features (such as AI setlist generation) require a paid subscription. The free plan
          has usage limits, such as the number of members an organization can have; current limits
          are listed on our <Link href="/#pricing">pricing page</Link>. Payments are processed
          securely by Stripe.
        </li>
        <li>Subscriptions renew automatically at the end of each billing period until canceled.</li>
        <li>
          You can cancel at any time; cancellation takes effect at the end of the current billing
          period, and fees already paid are non-refundable except where required by law.
        </li>
        <li>
          We may change subscription prices or plan limits with advance notice. Price changes apply
          from your next billing period.
        </li>
      </ul>

      <h2>9. AI-Generated Content</h2>
      <p>
        Some features use artificial intelligence to generate suggestions, such as setlists. AI
        output may be inaccurate or incomplete and is provided for convenience only — review it
        before relying on it. You are responsible for how you use AI-generated content.
      </p>

      <h2>10. Third-Party Services</h2>
      <p>
        The Service depends on third-party providers for things like authentication, hosting,
        email and SMS delivery, file storage, and payments. We choose reputable providers, but we
        are not responsible for interruptions or issues caused by services outside our control.
      </p>

      <h2>11. Intellectual Property</h2>
      <p>
        The Service itself — including its software, design, and branding — belongs to Aeghin and is
        protected by intellectual property laws. These Terms do not grant you any rights to the
        Service other than the limited right to use it as intended.
      </p>

      <h2>12. Termination</h2>
      <p>
        You may stop using the Service or delete your account at any time. We may suspend or
        terminate your access if you violate these Terms or use the Service in a way that could
        harm us or other users. Sections that by their nature should survive termination (such as
        ownership, disclaimers, and limitations of liability) will survive.
      </p>

      <h2>13. Disclaimer of Warranties</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties
        of any kind, whether express or implied, including implied warranties of merchantability,
        fitness for a particular purpose, and non-infringement. We do not warrant that the Service
        will be uninterrupted, error-free, or secure.
      </p>

      <h2>14. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Aeghin will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for lost profits, data, or
        goodwill, arising out of or related to your use of the Service. Our total liability for
        any claim will not exceed the greater of the amount you paid us in the twelve months
        before the claim or one hundred U.S. dollars ($100).
      </p>

      <h2>15. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Illinois, United States, without
        regard to its conflict-of-law provisions.
      </p>

      <h2>16. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will revise the &quot;Last
        updated&quot; date above, and for material changes we will provide additional notice.
        Continued use of the Service after changes take effect means you accept the updated Terms.
      </p>

      <h2>17. Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href="mailto:support@aeghin.com">support@aeghin.com</a>.
      </p>
    </>
  );
}
