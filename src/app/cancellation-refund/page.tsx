import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cancellation & Refund Policy" };

export default function CancellationRefundPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Cancellation &amp; Refund Policy</h1>
      <p className="mt-1 text-[13px] text-text3">Last updated: July 18, 2026</p>

      <div className="mt-6 flex flex-col gap-6 text-[15px] leading-relaxed text-text">
        <p>
          This Cancellation &amp; Refund Policy applies to event registrations and ticket purchases made through
          CloseConnect (the &quot;Service&quot;), operated as a proprietorship business (Udyam Registration Number:
          UDYAM-KR-03-0725059).
        </p>

        <Section title="1. Event Registrations & Ticket Purchases">
          <p>
            When you register for or purchase a ticket to an event listed on CloseConnect, your payment is processed
            securely through our third-party payment gateway partner.
          </p>
        </Section>

        <Section title="2. Cancellations by the Attendee">
          <ul className="list-disc pl-5">
            <li>
              If you wish to cancel your registration, you may do so from your account under &quot;My Events&quot; up to
              the cancellation window specified on the event page.
            </li>
            <li>
              Refund eligibility and any applicable cancellation fee depend on the specific event&apos;s refund policy,
              which is displayed at the time of registration.
            </li>
            <li>
              If no specific refund policy is displayed for an event, the following default policy applies:
              <ul className="mt-1 list-disc pl-5">
                <li>Cancellations made <strong>more than 48 hours</strong> before the event start time are eligible for a full refund.</li>
                <li>Cancellations made <strong>within 48 hours</strong> of the event start time are non-refundable.</li>
              </ul>
            </li>
          </ul>
        </Section>

        <Section title="3. Cancellations by the Event Organizer">
          <ul className="list-disc pl-5">
            <li>
              If an event is cancelled, postponed, or significantly changed by the organizer, registered attendees will
              be notified via email/in-app notification.
            </li>
            <li>
              In case of organizer-initiated cancellation, attendees are entitled to a <strong>full refund</strong> of
              the ticket amount.
            </li>
            <li>
              If an event is postponed, attendees may choose to receive a full refund or retain their registration for
              the rescheduled date.
            </li>
          </ul>
        </Section>

        <Section title="4. Refund Processing">
          <ul className="list-disc pl-5">
            <li>Approved refunds are processed back to the original payment method used at checkout.</li>
            <li>
              Refunds are typically processed within <strong>5-7 business days</strong>, depending on your bank or
              payment provider&apos;s processing time.
            </li>
            <li>
              CloseConnect does not charge any additional fee for processing refunds; however, payment gateway charges
              (if any) may be non-refundable as per our payment partner&apos;s policies.
            </li>
          </ul>
        </Section>

        <Section title="5. Non-Refundable Circumstances">
          <p>Refunds will not be issued in the following cases:</p>
          <ul className="list-disc pl-5">
            <li>No-show at the event without prior cancellation</li>
            <li>Cancellation requested after the event has concluded</li>
            <li>Violation of event-specific terms or code of conduct resulting in removal from the event</li>
          </ul>
        </Section>

        <Section title="6. Free Events">
          <p>
            Registrations for free events can be cancelled at any time before the event without any refund
            consideration, since no payment was collected.
          </p>
        </Section>

        <Section title="7. Disputes">
          <p>
            If you believe you&apos;re entitled to a refund that hasn&apos;t been processed, or if you have a dispute
            regarding an event, please contact us at the details below within 7 days of the event date. We will work
            with the event organizer to resolve the issue promptly.
          </p>
        </Section>

        <Section title="8. Contact Us">
          <p>For cancellation requests, refund queries, or disputes, contact us at:</p>
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
