import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Privacy Policy</h1>
      <p className="mt-1 text-[13px] text-text3">Last updated: August 25, 2026</p>

      <div className="mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-text">
        <p>
          CloseConnect (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), operated as a proprietorship business (Udyam
          Registration Number: UDYAM-KR-03-0741080), operates the CloseConnect mobile application and website (the
          &quot;Service&quot;), a hyperlocal platform for discovering local events, joining interest-based communities, and
          connecting with other users. This Privacy Policy explains how we collect, use, share, and protect your
          information when you use our Service, and describes the rights you have over it.
        </p>

        <Section title="1. Information We Collect">
          <p className="font-medium">Information you provide directly:</p>
          <ul className="list-disc pl-5">
            <li>Name, email address, and profile photo when you create an account (via Google sign-in or email)</li>
            <li>Date of birth, gender, city, occupation, and other profile details you choose to add</li>
            <li>Location (city/neighborhood) and, if you grant permission, a venue address to prefill an event location</li>
            <li>
              Content you post or send, including community posts, comments, ratings and reviews, group circle chat
              messages, direct messages to other users, and any photos, videos, or files you share in chat
            </li>
            <li>
              Payment information when you make a purchase (processed securely by our payment gateway partner; we do
              not store your card, UPI, or bank details ourselves)
            </li>
            <li>Verification information (e.g., proof of ownership) if you submit a request to claim a community</li>
            <li>A push notification device token, if you enable notifications, so we can deliver them to your device</li>
          </ul>
          <p className="mt-3 font-medium">Information collected automatically:</p>
          <ul className="list-disc pl-5">
            <li>Device information (device type, operating system, app version)</li>
            <li>Usage data (pages viewed, features used, time spent in-app)</li>
            <li>Approximate location (if you grant location permission), to personalize nearby event recommendations</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use collected information to:</p>
          <ul className="list-disc pl-5">
            <li>Show you relevant local events and communities near you</li>
            <li>Process payments for paid event registrations and ticket purchases, and disburse proceeds to hosts</li>
            <li>Facilitate community formation, group chat, direct messaging, and coordination between users</li>
            <li>Show your public profile information to other users, consistent with your chosen profile visibility setting</li>
            <li>Send you notifications about events, community activity, messages, or follows you&apos;ve opted into</li>
            <li>Review community-claim and content-report submissions</li>
            <li>Improve and maintain the Service, and fix bugs or technical issues</li>
            <li>Respond to support requests</li>
          </ul>
        </Section>

        <Section title="3. How We Share Your Information">
          <p>
            We do <strong>not</strong> sell your personal information. We share information only:
          </p>
          <ul className="list-disc pl-5">
            <li>With our payment gateway partner, to complete transactions and disburse host payouts</li>
            <li>With other users, limited to what your profile visibility setting and the Service&apos;s own features expose (e.g., your display name and message content are visible to people in a chat you send them to)</li>
            <li>With event organizers or community hosts, limited to what&apos;s needed to fulfill your registration or membership</li>
            <li>With service providers who help us operate the Service (e.g., cloud hosting, push notifications), under confidentiality obligations</li>
            <li>When required by law, regulation, or valid legal process</li>
          </ul>
        </Section>

        <Section title="4. Data Retention & Deletion">
          <p>
            We retain your information for as long as your account is active or as needed to provide the Service, resolve
            disputes, or comply with legal obligations. You may request deletion of your account and associated personal
            data at any time by contacting us at the email in Section 9; we will complete deletion requests within a
            reasonable time, except for information we&apos;re required to retain for legal, tax, or fraud-prevention
            purposes.
          </p>
        </Section>

        <Section title="5. Data Security">
          <p>
            We use industry-standard measures to protect your information, including encrypted data transmission,
            row-level access controls on our database, and restricted access to personal data. However, no method of
            transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="6. Your Rights">
          <p>Subject to applicable law, you may:</p>
          <ul className="list-disc pl-5">
            <li>Access, correct, or update your personal information via your account settings</li>
            <li>Request a copy of, or the erasure of, your account and data by contacting us at the email below</li>
            <li>Change your profile visibility (public, members-only, or private) at any time</li>
            <li>Opt out of non-essential notifications at any time</li>
            <li>Raise a grievance about how your data is handled, and expect a response (see Section 9)</li>
          </ul>
        </Section>

        <Section title="7. Children's Privacy">
          <p>
            CloseConnect is not intended for and may not be used by anyone under the age of 18. We do not knowingly
            collect personal information from anyone under 18; if we learn we have, we will delete it.
          </p>
        </Section>

        <Section title="8. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify users of material changes via the app or
            email. Continued use of the Service after changes constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="9. Contact Us & Grievance Redressal">
          <p>
            If you have questions about this Privacy Policy, want to exercise a right described in Section 6, or have a
            grievance about how your data is handled, contact us at:
          </p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:support@closeconnect.in" className="text-green hover:underline">
              support@closeconnect.in
            </a>
          </p>
          <p>We aim to acknowledge requests within 48 hours and resolve them within 30 days.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-heading text-[17px] font-bold leading-tight">{title}</h2>
      <div className="flex flex-col gap-1 text-text2">{children}</div>
    </section>
  );
}
