// Shared Resend sender for every transactional email the app sends
// directly (as opposed to Supabase Auth's own magic-link/confirmation
// templates). One place for the verified sender domain -- closeconnect.in,
// not closeconnect.app -- so this can't drift out of sync the way
// send-event-reminders did before that got caught and fixed.
const FROM = "Close.Connect <notifications@closeconnect.in>";

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`Resend send failed for ${to}: ${res.status} ${await res.text()}`);
  }
}
