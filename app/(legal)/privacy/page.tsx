import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Aeghin",
  description:
    "How Aeghin collects, uses, and protects your information on the web and in the mobile app.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-sm">Last updated: October 2, 2026</p>

      <h2>1. Overview</h2>
      <p>
        Aeghin (&quot;Aeghin&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the Aeghin
        platform at{" "}
        <a href="https://aeghin.com">https://aeghin.com</a> and the Aeghin mobile app (together,
        the &quot;Service&quot;), an event
        planning and volunteer management tool that helps organizations such as churches and
        nonprofits plan events, manage volunteer teams, and coordinate schedules. This Privacy
        Policy explains what information we collect, how we use and share it, and the choices you
        have. By creating an account or using the Service, you agree to this policy.
      </p>

      <h2>2. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you sign up, we collect your first and last
          name, email address, phone number, and a password. Authentication is handled by our
          identity provider, Clerk.
        </li>
        <li>
          <strong>Organization and scheduling content.</strong> Information you or your
          organization add to the Service, such as organizations and their members, volunteer
          roles, events and event dates, volunteer assignments, availability and blockout dates,
          songs, setlists, and song keys, event chat messages, and files you upload.
        </li>
        <li>
          <strong>Invitation details.</strong> When an owner or administrator invites someone to
          join an organization, we collect the invitee&apos;s email address and mobile phone
          number in order to deliver the invitation.
        </li>
        <li>
          <strong>Mobile app and notifications.</strong> If you use the mobile app and allow
          notifications, we store a push notification token for your device and your
          device&apos;s time zone, so reminders arrive at a reasonable local time.
        </li>
        <li>
          <strong>Payment information.</strong> If you purchase a paid feature, payments are
          processed by Stripe. We receive subscription status and limited billing details, but we
          never see or store your full card number.
        </li>
        <li>
          <strong>Usage data.</strong> Standard log and device information such as IP address,
          browser type, and pages visited, along with cookies required for sign-in and session
          management.
        </li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li>
          Provide and operate the Service, including organizations, events, volunteer scheduling,
          and availability.
        </li>
        <li>
          Send service communications by email and push notification, such as organization
          invitations, event invitations and scheduling requests, event reminders, and updates
          about events or your account.
        </li>
        <li>Process payments and manage subscriptions for paid features.</li>
        <li>
          Power AI-assisted features (such as setlist suggestions and event drafts), which may
          involve processing your organization&apos;s song, event, and volunteer availability data
          through our AI providers. On the Pro plan, the AI can also search the web for song and
          artist information.
        </li>
        <li>
          Keep the Service secure, prevent abuse, troubleshoot problems, and improve
          functionality.
        </li>
        <li>Respond to your questions and support requests.</li>
      </ul>
      <p>
        We do not sell your personal information, and we do not use it for third-party
        advertising.
      </p>

      <h2>4. How We Share Information</h2>
      <ul>
        <li>
          <strong>Within your organizations.</strong> Members and administrators of an
          organization you belong to can see your name, contact details, volunteer roles,
          assignments, and availability as needed to coordinate scheduling.
        </li>
        <li>
          <strong>Service providers.</strong> We rely on trusted providers to run the Service:
          Clerk (authentication), Neon (database hosting), Vercel (application hosting and AI
          gateway), Anthropic (AI models), Ably (realtime event chat), Expo (push notification
          delivery, through Apple and Google), Resend (email delivery), Stripe (payment
          processing), and UploadThing (file storage). These providers may process your
          information only to perform services for us.
        </li>
        <li>
          <strong>Legal requirements.</strong> We may disclose information if required by law, or
          to protect the rights, safety, or property of Aeghin, our users, or others.
        </li>
        <li>
          <strong>Business transfers.</strong> If Aeghin is involved in a merger, acquisition, or
          sale of assets, your information may be transferred as part of that transaction, and we
          will notify you before your information becomes subject to a different privacy policy.
        </li>
      </ul>
      <p>We do not sell or rent your personal information to anyone.</p>

      <h2>5. Data Retention</h2>
      <p>
        We keep your information for as long as your account is active or as needed to provide the
        Service. When you delete your account, or ask us to delete it, we remove or anonymize your
        personal information within a reasonable period, except where we must retain it to comply
        with legal obligations, resolve disputes, or enforce our agreements. Content you added to
        an organization (such as events or assignments) may remain available to that organization
        after you leave it.
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard safeguards to protect your information, including encryption in
        transit, access controls, and reputable infrastructure providers. No method of
        transmission or storage is completely secure, so we cannot guarantee absolute security.
      </p>

      <h2>7. Your Choices and Rights</h2>
      <ul>
        <li>Update your account information at any time through your account settings.</li>
        <li>Turn off push notifications at any time in your device&apos;s settings.</li>
        <li>
          Delete your account yourself at any time; our{" "}
          <Link href="/support">Support page</Link> explains how and what is removed.
        </li>
        <li>
          Request access to, correction of, or deletion of your personal information by emailing{" "}
          <a href="mailto:support@aeghin.com">support@aeghin.com</a>.
        </li>
        <li>
          Depending on where you live, you may have additional rights under local law, such as
          data portability or the right to object to certain processing.
        </li>
      </ul>

      <h2>8. Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect personal
        information from them. If you believe a child under 13 has provided us personal
        information, contact us and we will delete it.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the
        &quot;Last updated&quot; date above, and for material changes we will provide additional
        notice, such as an email or an in-app message. Your continued use of the Service after
        changes take effect means you accept the updated policy.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        Questions about this policy or your data? Email us at{" "}
        <a href="mailto:support@aeghin.com">support@aeghin.com</a>. You can also review our{" "}
        <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
    </>
  );
}
