import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

// Generates a downloadable PDF ticket for one of the current user's own
// event registrations -- used by both the post-registration success screen
// (EventRegistration.tsx) and the profile page's upcoming-events list
// (RegisteredEventRow.tsx). Deliberately Node runtime (pdf-lib/qrcode need
// real Buffers, not the Edge runtime's Web Streams-only environment).
export const runtime = "nodejs";

function formatEventDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatEventTime12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatRegisteredAt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your ticket." }, { status: 401 });

  // No manual ownership check needed beyond this query itself -- it runs
  // through the request-scoped (cookie-authenticated) client, so
  // form_responses' own RLS (respondent_id = auth.uid(), or the event host)
  // is what actually decides whether this row comes back at all.
  const { data: registration, error: registrationError } = await supabase
    .from("form_responses")
    .select("id, owner_type, owner_id, ticket_type_id, response_data, quantity, payment_status, payment_reference, created_at")
    .eq("id", id)
    .eq("owner_type", "event")
    .single();
  if (registrationError || !registration) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("id, event_name, event_date, event_time, event_end_time, venue, city, event_mode, category, host:profiles!events_host_id_fkey(display_name)")
    .eq("id", registration.owner_id)
    .single();
  if (eventError || !eventRow) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const event = eventRow as unknown as typeof eventRow & { host: { display_name: string } | null };

  const { data: ticketType } = registration.ticket_type_id
    ? await supabase.from("event_ticket_types").select("name, price").eq("id", registration.ticket_type_id).maybeSingle()
    : { data: null };

  // event_meeting_links' own RLS (0069) only returns a row to the host or a
  // confirmed/paid registrant -- this request runs through the request's
  // own cookie-authenticated client, and this route only ever answers for
  // the registrant's own ticket, so a row coming back at all already means
  // they're entitled to see it.
  const { data: meetingLink } =
    event.event_mode === "online"
      ? await supabase.from("event_meeting_links").select("meeting_link").eq("event_id", event.id).maybeSingle()
      : { data: null };

  const eventDate = event.event_date;
  const eventTime = event.event_time;
  const responseData = registration.response_data as { name?: string; email?: string } | null;
  const attendeeName = responseData?.name ?? user.user_metadata?.full_name ?? "Guest";
  const attendeeEmail = responseData?.email ?? user.email ?? "";
  const amountPaid = (ticketType?.price ?? 0) * registration.quantity;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([396, 620]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.12, 0.48, 0.37);
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const border = rgb(0.85, 0.85, 0.85);
  let y = 620;

  function draw(text: string, opts: { x?: number; size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(text, { x: opts.x ?? 24, y, size: opts.size ?? 11, font: opts.f ?? font, color: opts.color ?? dark });
  }

  y -= 32;
  draw("CloseConnect", { size: 16, f: bold, color: green });
  draw("EVENT TICKET", { x: 396 - 24 - bold.widthOfTextAtSize("EVENT TICKET", 9), size: 9, f: bold, color: gray });

  y -= 24;
  page.drawLine({ start: { x: 24, y }, end: { x: 396 - 24, y }, thickness: 1, color: border });

  y -= 28;
  const nameLines = wrapText(event.event_name, bold, 16, 396 - 48);
  for (const line of nameLines) {
    draw(line, { size: 16, f: bold });
    y -= 20;
  }

  y -= 4;
  draw(eventDate ? formatEventDate(eventDate) : "Date to be announced", { size: 12 });
  y -= 18;
  draw(
    eventTime ? `${formatEventTime12h(eventTime)}${event.event_end_time ? ` - ${formatEventTime12h(event.event_end_time)}` : ""}` : "Time to be announced",
    { size: 12, color: gray },
  );
  y -= 18;
  draw(event.event_mode === "online" ? "Online event" : [event.venue, event.city].filter(Boolean).join(", ") || "Venue to be announced", {
    size: 12,
    color: gray,
  });
  if (event.event_mode === "online" && meetingLink?.meeting_link) {
    y -= 18;
    for (const line of wrapText(meetingLink.meeting_link, font, 10, 396 - 48)) {
      draw(line, { size: 10, color: green });
      y -= 13;
    }
    y += 13;
  }

  y -= 30;
  page.drawLine({ start: { x: 24, y }, end: { x: 396 - 24, y }, thickness: 1, color: border });

  const row = (label: string, value: string) => {
    y -= 26;
    draw(label, { size: 9, color: gray });
    draw(value, { x: 150, size: 11, f: bold });
  };
  row("ATTENDEE", attendeeName);
  row("EMAIL", attendeeEmail);
  row("HOSTED BY", event.host?.display_name ?? "CloseConnect host");
  row("TICKET TYPE", ticketType?.name ?? "General");
  row("QUANTITY", String(registration.quantity));
  row("AMOUNT PAID", amountPaid > 0 ? `Rs. ${amountPaid}` : "Free");
  if (registration.payment_reference) row("PAYMENT REF", registration.payment_reference);
  row("STATUS", registration.payment_status === "paid" ? "Confirmed" : registration.payment_status === "unpaid" ? "Pending payment" : "Confirmed");
  row("REGISTERED ON", formatRegisteredAt(registration.created_at));

  y -= 34;
  page.drawLine({ start: { x: 24, y }, end: { x: 396 - 24, y }, thickness: 1, color: border });

  // A short reference code (not a scannable QR -- not needed yet) so a
  // host can look this registration up against the Manage page's list
  // without retyping the full uuid.
  y -= 30;
  const shortCode = registration.id.slice(0, 8).toUpperCase();
  const codeLabel = "REFERENCE CODE";
  const labelWidth = bold.widthOfTextAtSize(codeLabel, 9);
  page.drawText(codeLabel, { x: (396 - labelWidth) / 2, y, size: 9, font: bold, color: gray });
  y -= 20;
  const codeWidth = bold.widthOfTextAtSize(shortCode, 18);
  page.drawText(shortCode, { x: (396 - codeWidth) / 2, y, size: 18, font: bold, color: dark });

  y -= 30;
  const footer = "Present this ticket (or the code above) at the event. Questions? support@closeconnect.in";
  for (const line of wrapText(footer, font, 8, 396 - 48)) {
    const w = font.widthOfTextAtSize(line, 8);
    page.drawText(line, { x: (396 - w) / 2, y, size: 8, font, color: gray });
    y -= 11;
  }

  function wrapText(text: string, f: typeof font, size: number, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  const pdfBytes = await pdfDoc.save();
  const fileSafeName = event.event_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "ticket";

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="closeconnect-${fileSafeName}.pdf"`,
    },
  });
}
