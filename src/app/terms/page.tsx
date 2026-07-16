import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Terms of Service</h1>
      <p className="mt-1 text-[13px] text-text3">Last updated: July 11, 2026</p>

      <div className="mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-text">
        <p>
          Welcome to CloseConnect. These Terms of Service (&quot;Terms&quot;) govern your use of the CloseConnect mobile
          application and website (the &quot;Service&quot;), operated as a proprietorship business (Udyam Registration Number:
          UDYAM-KR-03-0725059). By using the Service, you agree to these Terms.
        </p>

        <Section title="1. About the Service">
          <p>
            CloseConnect is a hyperlocal platform that helps users discover local events, join or form interest-based
            communities, and coordinate group attendance at events. CloseConnect facilitates event ticketing and community
            discovery between users and local event organizers; it does not itself organize events or sell goods, except
            where explicitly stated.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 18 years old to create an account and use the Service. By using the Service, you confirm
            that you meet this requirement.
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
              Payments made through the Service (for paid event registrations and ticket purchases) go directly to the
              event organizer via UPI -- the Service itself does not process, hold, or route payments through any
              third-party payment processor.
            </li>
            <li>All prices are displayed in Indian Rupees (INR) unless stated otherwise.</li>
            <li>
              Refunds, if applicable, are governed by the specific refund policy of the event organizer, communicated at
              the time of registration.
            </li>
          </ul>
        </Section>

        <Section title="5. Communities & Group Conduct">
          <p>Users may join or form communities to coordinate around shared interests and event attendance. You agree to:</p>
          <ul className="list-disc pl-5">
            <li>Provide accurate information when joining or forming a community</li>
            <li>Not use the Service to harass, spam, defraud, or mislead other users</li>
            <li>Not use community features for unrelated commercial solicitation</li>
          </ul>
          <p className="mt-3">CloseConnect reserves the right to remove any user or community that violates these Terms.</p>
        </Section>

        <Section title="6. Event Organizer Listings">
          <p>
            Events are listed by third-party organizers or by CloseConnect. CloseConnect makes reasonable efforts to
            verify listings but is not responsible for the accuracy of third-party event details, or an organizer&apos;s
            fulfillment of an event.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All content, branding, and technology associated with the Service (excluding user-generated content and
            third-party listings) is owned by CloseConnect. You may not copy, modify, or distribute this content without
            permission.
          </p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>
            CloseConnect is provided on an &quot;as is&quot; basis. To the extent permitted by law, we are not liable for
            indirect, incidental, or consequential damages arising from your use of the Service, including disputes with
            local businesses, event organizers, or other users.
          </p>
        </Section>

        <Section title="9. Termination">
          <p>
            We may suspend or terminate your access to the Service if you violate these Terms or engage in fraudulent or
            harmful activity.
          </p>
        </Section>

        <Section title="10. Governing Law">
          <p>
            These Terms are governed by the laws of India, with courts in Bengaluru, Karnataka having exclusive
            jurisdiction over any disputes.
          </p>
        </Section>

        <Section title="11. Changes to These Terms">
          <p>
            We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance
            of the updated Terms.
          </p>
        </Section>

        <Section title="12. Contact Us">
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
