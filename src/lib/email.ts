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
    const body = await res.text();
    // Throws, rather than only logging -- every caller now awaits this
    // (Cloudflare Workers can kill an un-awaited promise before its fetch
    // completes, which is what silently dropped these before), so a
    // caller's own try/catch needs a real rejection to actually see a
    // Resend-side failure (bad from-domain, invalid key, rate limit) --
    // a resolved promise that only logged internally was invisible to it.
    throw new Error(`Resend send failed for ${to}: ${res.status} ${body}`);
  }
}
