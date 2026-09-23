import type { Metadata } from "next";

export const metadata: Metadata = { title: "Delete Your Account" };

export default function AccountDeletionPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Delete Your CloseConnect Account</h1>
      <p className="mt-1 text-[13px] text-text3">Last updated: September 15, 2026</p>

      <div className="mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-text">
        <p>
          You can permanently delete your CloseConnect account and personal data at any time, directly from the app
          or the website. No need to contact support.
        </p>

        <Section title="How to delete your account">
          <p className="font-medium">In the CloseConnect app:</p>
          <ol className="list-decimal pl-5">
            <li>Open the app and go to your Profile tab</li>
            <li>Tap Edit Profile, then scroll to Delete Account</li>
            <li>Confirm the deletion</li>
          </ol>
          <p className="mt-3 font-medium">On the website:</p>
          <ol className="list-decimal pl-5">
            <li>
              Sign in at <span className="text-green">closeconnect.in</span>
            </li>
            <li>Go to Profile → Edit Profile</li>
            <li>Scroll to Delete Account and confirm</li>
          </ol>
          <p className="mt-3">Your account is deleted immediately -- you're signed out and can no longer log back in.</p>
        </Section>

        <Section title="What gets deleted">
          <ul className="list-disc pl-5">
            <li>Your name, profile photo, bio, and any other profile details (occupation, links, interests, etc.)</li>
            <li>Your date of birth, gender, and username</li>
            <li>Your login access -- your email/Google sign-in can no longer be used to access this account</li>
            <li>Your push notification device token</li>
            <li>Any block lists associated with your account</li>
          </ul>
        </Section>

        <Section title="What's retained, and why">
          <p>
            Some data is kept even after deletion, for reasons required by law or the legitimate operation of the
            platform:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <span className="font-medium">Payment and ticket records</span> -- transaction history for events you
              paid for is retained for accounting, tax, and fraud-prevention purposes, as required under Indian tax
              and financial regulations. These records are kept in our system but are no longer linked to an
              identifiable profile you can access.
            </li>
            <li>
              <span className="font-medium">Content you sent to others</span> -- messages you've sent in group chats
              or direct messages remain visible to the people you sent them to (the same way a text message doesn't
              disappear from the recipient's phone), but they'll display as sent by &quot;Deleted user&quot; instead
              of your name or photo.
            </li>
            <li>
              <span className="font-medium">Communities or events you created or hosted</span> -- these remain
              active for their other members/attendees, but will show &quot;Deleted user&quot; as the owner/host.
            </li>
          </ul>
          <p className="mt-3">
            Retained payment records are kept for up to 7 years in line with standard financial record-keeping
            practice in India. All other retained content (messages, community/event ownership records) is kept
            indefinitely in anonymized form, since it belongs to the conversation or group context of other users who
            haven&apos;t deleted their accounts.
          </p>
        </Section>

        <Section title="Requesting deletion without deleting your whole account">
          <p>
            If you'd like specific data deleted (for example, a single message or community) without deleting your
            entire account, contact us at{" "}
            <a href="mailto:support@closeconnect.in" className="text-green underline">
              support@closeconnect.in
            </a>{" "}
            and we'll process your request within a reasonable time.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            See our{" "}
            <a href="/privacy" className="text-green underline">
              Privacy Policy
            </a>{" "}
            for more on how CloseConnect handles your data, or email{" "}
            <a href="mailto:support@closeconnect.in" className="text-green underline">
              support@closeconnect.in
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-heading text-[17px] font-semibold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </div>
  );
}
