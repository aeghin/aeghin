import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support | Aeghin",
  description:
    "Get help with Aeghin — contact support, answers to common questions about organizations, events, volunteers, billing, and account deletion.",
};

export default function SupportPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Support</h1>
      <p>
        Aeghin helps churches and nonprofits plan events, build teams, and keep volunteers in
        sync — on the web at <a href="https://aeghin.com">aeghin.com</a> and in the iOS app. If
        something is not working or you are not sure how a feature is meant to behave, we are
        happy to help.
      </p>

      <h2>Contact us</h2>
      <p>
        Email <a href="mailto:support@aeghin.com">support@aeghin.com</a>. We answer within two
        business days. To help us resolve things on the first reply, include:
      </p>
      <ul>
        <li>The email address on your account.</li>
        <li>The name of the organization involved, if the problem is specific to one.</li>
        <li>Whether you were on the web or the mobile app, and what you were trying to do.</li>
        <li>A screenshot, if the issue is something you can see.</li>
      </ul>

      <h2>Getting started</h2>
      <ul>
        <li>
          <strong>Create or join an organization.</strong> Everything in Aeghin belongs to an
          organization. Create one when you sign up, or accept an invitation to join an existing
          one. You can belong to more than one and switch between them at any time.
        </li>
        <li>
          <strong>Invite your team.</strong> Owners and managers can invite members by email.
          Invitees receive a link that adds them to the organization once they sign in.
        </li>
        <li>
          <strong>Set up roles and service types.</strong> Roles describe what a volunteer can be
          scheduled for. Defining them first makes scheduling much faster later.
        </li>
        <li>
          <strong>Create an event.</strong> Pick a date and time, assign volunteers to roles, and
          build a setlist. Assigned volunteers are notified by email and can accept or decline.
        </li>
        <li>
          <strong>Add blockout dates.</strong> Volunteers can mark the days they are unavailable,
          and those dates are respected when someone is assigned.
        </li>
      </ul>

      <h2>Common questions</h2>
      <ul>
        <li>
          <strong>I did not receive an invitation email.</strong> Check your spam folder for a
          message from support@aeghin.com. If it is not there, ask an owner or manager to resend
          it, and confirm they used the right address.
        </li>
        <li>
          <strong>A volunteer declined and someone else was invited.</strong> That is expected.
          When an assignment is declined, Aeghin looks for another eligible member for that role
          and invites them automatically.
        </li>
        <li>
          <strong>Someone cannot see an event.</strong> Events are visible to members of the
          organization that owns them. Confirm the person is a member of that organization and
          not a different one.
        </li>
        <li>
          <strong>I am signed in but the app looks empty.</strong> You are most likely viewing an
          organization you have just joined and that has no events yet, or you have switched
          organizations. Check the organization selector first.
        </li>
      </ul>

      <h2>Billing and subscriptions</h2>
      <p>
        Paid plans are purchased and managed from your account on{" "}
        <a href="https://aeghin.com">aeghin.com</a>, under Settings, and payments are processed by
        Stripe. A plan applies to an organization rather than to an individual, so upgrading
        unlocks the paid features for everyone in that organization — including in the mobile
        app, where the features are available but not sold. Only an organization owner can change
        a plan. For refunds or billing problems, email{" "}
        <a href="mailto:support@aeghin.com">support@aeghin.com</a>.
      </p>

      <h2>Deleting your account</h2>
      <p>You can delete your Aeghin account yourself, at any time, and without contacting us.</p>
      <ul>
        <li>
          <strong>In the mobile app:</strong> <strong>Settings</strong> →{" "}
          <strong>Account</strong> → <strong>Security</strong> →{" "}
          <strong>Delete account</strong>.
        </li>
        <li>
          <strong>On the web:</strong> click your profile picture in the top navigation →{" "}
          <strong>Manage account</strong> → <strong>Security</strong> →{" "}
          <strong>Delete account</strong>.
        </li>
      </ul>
      <p>
        Deletion is immediate and cannot be undone. It removes your profile, your memberships,
        your event assignments, your blockout dates, your chat messages, your setlist vocal
        assignments, and any invitations you sent. Events you created stay with the organization
        but are no longer attributed to you.
      </p>
      <p>
        <strong>If you own an organization, read this first.</strong> For each organization you
        own where you are the only owner, Aeghin passes ownership to the longest-standing admin,
        or to the longest-standing member if there are no admins, and records the change in that
        organization&apos;s activity log. But if you are the <em>only</em> member, there is no one
        to inherit it, and the organization is deleted along with your account — its events,
        songs, setlists, templates, service types, and uploaded files included. If you want an
        organization to outlive your account, invite someone to it before you delete, or promote
        an existing member to owner yourself.
      </p>
      <p>
        If you only want to leave one organization rather than delete everything, remove yourself
        from that organization instead and keep your account.
      </p>

      <h2>Privacy and terms</h2>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for what we collect and how it is
        used, and our <Link href="/terms">Terms &amp; Conditions</Link> for the rules that govern
        the Service.
      </p>
    </>
  );
}
