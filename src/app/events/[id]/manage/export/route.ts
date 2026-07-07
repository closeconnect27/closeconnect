import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventById, getEventRegistrations, getEventFormFields, type EventRegistration } from "@/lib/queries/events";
import type { FormField } from "@/lib/queries/membership";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let event;
  try {
    event = await getEventById(supabase, id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Belt-and-suspenders alongside RLS: getEventRegistrations would already
  // come back empty for a non-host caller, but a 403 is a clearer signal
  // than a silently-empty CSV.
  if (event.host_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [registrations, formFields] = await Promise.all([
    getEventRegistrations(supabase, id),
    getEventFormFields(supabase, id),
  ]);
  const csv = toCsv(registrations, formFields);
  const filename = event.event_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-registrants.csv"`,
    },
  });
}

// Registrants fill in their own name -- CSV cells starting with =, +, -, @
// are treated as formulas by Excel/Sheets on open (a well-known CSV
// injection vector), so those get a leading quote to defuse them, same
// principle as the app's other rule about never trusting user input as-is.
function csvField(value: string) {
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function toCsv(registrations: EventRegistration[], formFields: FormField[]) {
  const header = [
    "Name",
    "Email",
    "Ticket type",
    "Registered at",
    "Checked in",
    ...formFields.map((f) => f.label),
  ];
  const rows = registrations.map((r) => [
    r.response_data.name ?? "",
    r.response_data.email ?? "",
    r.event_ticket_types?.name ?? "",
    new Date(r.created_at).toISOString(),
    r.checked_in_at ? "yes" : "no",
    ...formFields.map((f) => r.response_data[f.id] ?? ""),
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}
