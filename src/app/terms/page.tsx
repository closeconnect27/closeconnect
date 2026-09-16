import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Terms of Service</h1>
      <p className="mt-1 text-[13px] text-text3">Last updated: August 25, 2026</p>

      <div className="mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-text">
        <p>
          Welcome to CloseConnect. These Terms of Service (&quot;Terms&quot;) govern your use of the CloseConnect mobile
          application and website (the &quot;Service&quot;), operated as a proprietorship business (Udyam Registration Number:
          UDYAM-KR-03-0741080). By using the Service, you agree to these Terms.
        </p>

        <Section title="1. About the Service">
          <p>
            CloseConnect is a hyperlocal platform that helps users discover local events, join or form interest-based
            communities, chat in group circles and direct messages, follow other users, rate and review communities and
            hosts, and coordinate group attendance at events. CloseConnect facilitates event ticketing and community
            discovery between users and local event organizers; it does not itself organize events or sell goods, except
            where explicitly stated.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 18 years old to create an account and use the Service. By using the Service, you confirm
            that you meet this requirement. We do not knowingly allow anyone under 18 to hold an account, and we may
            suspend or remove any account we reasonably believe belongs to someone under 18.
          </p>
        </Section>

        <Section title="3. Account Registration">
          <p>
            You are responsible for maintaining accurate account information and for keeping your login credentials
            secure. You are responsible for all activity under your account.
          </p>
        </Section>

        <Section title="4. Payments">
          <ul className="list-disc pl-5">
            <li>
              Payments made through the Service (for paid event registrations and ticket purchases) are processed via
              our third-party payment gateway partner (currently Razorpay). We do not store your card, UPI, or bank
              details ourselves &mdash; they are handled directly by the payment gateway.
            </li>
            <li>All prices on the Service are displayed and charged strictly in Indian Rupees (INR).</li>
            <li>
              When you pay for a ticket, that payment is collected by CloseConnect through the payment gateway on
              behalf of the event&apos;s host, and CloseConnect subsequently disburses the proceeds to the host as
              described in Section 5 below. CloseConnect is not a party to the underlying arrangement between you and
              the host for the event itself.
            </li>
            <li>
              Refunds, if applicable, are governed by our{" "}
              <a href="/cancellation-refund" className="text-green hover:underline">
                Cancellation &amp; Refund Policy
              </a>{" "}
              and any event-specific refund terms communicated at the time of registration.
            </li>
          </ul>
        </Section>

        <Section title="5. Host Payouts">
          <p>
            CloseConnect currently disburses ticket proceeds to event hosts manually, after collecting payment through
            our payment gateway partner. As of this policy&apos;s last update, CloseConnect does not deduct a
            commission from ticket sales; hosts receive the full ticket price collected, less any payment gateway
            processing charges. This may change in the future, in which case this section will be updated in advance.
            Hosts are solely responsible for delivering the event as described in their listing, and for any taxes
            applicable to their own earnings.
          </p>
        </Section>

        <Section title="6. User Content & Conduct">
          <p>
            The Service lets you post content &mdash; community posts, comments, chat messages in group circles,
            direct messages, ratings, and reviews &mdash; and interact with other users, including by following them
            and messaging them. You agree to:
          </p>
          <ul className="list-disc pl-5">
            <li>Provide accurate information when joining or forming a community, or posting content</li>
            <li>Not use the Service to harass, threaten, spam, defraud, or mislead other users</li>
            <li>Not post content that is illegal, obscene, defamatory, or infringes someone else&apos;s rights</li>
            <li>Not use community or chat features for unrelated commercial solicitation</li>
          </ul>
          <p className="mt-3">
            You are solely responsible for content you post or send. CloseConnect reserves the right to remove any
            content, user, or community that violates these Terms, and to act on reports submitted through the
            Service&apos;s reporting features.
          </p>
        </Section>

        <Section title="7. Event Organizer Listings & Community Claiming">
          <p>
            Events are listed by third-party organizers or by CloseConnect. CloseConnect makes reasonable efforts to
            verify listings but is not responsible for the accuracy of third-party event details, or an organizer&apos;s
            fulfillment of an event. Community &quot;claiming&quot; (where an existing community&apos;s ownership is
            verified and transferred to a real business or organizer) is reviewed by CloseConnect, but a claim being
            approved does not make CloseConnect responsible for that community&apos;s or its owner&apos;s conduct.
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            All content, branding, and technology associated with the Service (excluding user-generated content and
            third-party listings) is owned by CloseConnect. You may not copy, modify, or distribute this content without
            permission.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            CloseConnect is provided on an &quot;as is&quot; basis. To the extent permitted by law, we are not liable for
            indirect, incidental, or consequential damages arising from your use of the Service, including disputes
            with local businesses, event organizers, or other users, or anything arising from in-person meetups,
            events, or interactions arranged through the Service. You are responsible for your own safety and judgment
            when meeting other users or attending events.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            We may suspend or terminate your access to the Service if you violate these Terms or engage in fraudulent or
            harmful activity.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms are governed by the laws of India, with courts in Bengaluru, Karnataka having exclusive
            jurisdiction over any disputes.
          </p>
        </Section>

        <Section title="12. Grievance Redressal">
          <p>
            If you have a complaint about content, another user&apos;s conduct, or these Terms, please write to us at
            the email below. We aim to acknowledge complaints within 48 hours and resolve them within 30 days.
          </p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>
            We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance
            of the updated Terms.
          </p>
        </Section>

        <Section title="14. Contact Us">
          <p>For questions about these Terms, contact us at:</p>
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
