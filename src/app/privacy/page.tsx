import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Privacy Policy</h1>
      <p className="mt-1 text-[13px] text-text3">Last updated: July 11, 2026</p>

      <div className="mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-text">
        <p>
          CloseConnect (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the CloseConnect mobile application and website (the
          &quot;Service&quot;), a hyperlocal platform for discovering local events and joining interest-based communities. This
          Privacy Policy explains how we collect, use, and protect your information when you use our Service.
        </p>

        <Section title="1. Information We Collect">
          <p className="font-medium">Information you provide directly:</p>
          <ul className="list-disc pl-5">
            <li>Name, email address, and phone number when you create an account</li>
            <li>Location (city/neighborhood) to show relevant local events</li>
            <li>
              Payment information when you make a purchase (processed securely by our payment partner; we do not store your
              card or bank details)
            </li>
            <li>Content you post, such as community posts, event RSVPs, or reviews</li>
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
            <li>Process payments for paid event registrations and ticket purchases</li>
            <li>Facilitate community formation and coordination between users</li>
            <li>Send you notifications about events or community activity you&apos;ve opted into</li>
            <li>Improve and maintain the Service, and fix bugs or technical issues</li>
            <li>Respond to support requests</li>
          </ul>
        </Section>

        <Section title="3. How We Share Your Information">
          <p>
            We do <strong>not</strong> sell your personal information. We share information only:
          </p>
          <ul className="list-disc pl-5">
            <li>With payment processors (such as Razorpay) to complete transactions</li>
            <li>With event organizers you interact with, limited to what&apos;s needed to fulfill your event registration</li>
            <li>With service providers who help us operate the Service (e.g., cloud hosting), under confidentiality obligations</li>
            <li>When required by law, regulation, or valid legal process</li>
          </ul>
        </Section>

        <Section title="4. Data Retention">
          <p>
            We retain your information for as long as your account is active or as needed to provide the Service. You may
            request deletion of your account and associated data at any time (see Section 6).
          </p>
        </Section>

        <Section title="5. Data Security">
          <p>
            We use industry-standard measures to protect your information, including encrypted data transmission and
            restricted access to personal data. However, no method of transmission or storage is 100% secure, and we cannot
            guarantee absolute security.
          </p>
        </Section>

        <Section title="6. Your Rights">
          <p>You may:</p>
          <ul className="list-disc pl-5">
            <li>Access, correct, or update your personal information via your account settings</li>
            <li>Request deletion of your account and data by contacting us at the email below</li>
            <li>Opt out of non-essential notifications at any time</li>
          </ul>
        </Section>

        <Section title="7. Children's Privacy">
          <p>
            CloseConnect is not intended for users under the age of 18. We do not knowingly collect personal information
            from minors.
          </p>
        </Section>

        <Section title="8. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify users of material changes via the app or
            email. Continued use of the Service after changes constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="9. Contact Us">
          <p>If you have questions about this Privacy Policy or your data, contact us at:</p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:closeconnect27@gmail.com" className="text-green hover:underline">
              closeconnect27@gmail.com
            </a>
          </p>
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
