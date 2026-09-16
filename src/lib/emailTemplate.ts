// Shared visual shell for every transactional email sendEmail() sends --
// one place for the brand wrapper (header, card, footer, button style) so
// each individual email only supplies its own subject/body copy instead of
// hand-rolling <p> tags with no color, spacing, or branding (what every
// email in this codebase looked like before this file existed).
//
// Colors are the app's own *light*-theme tokens (globals.css), not the
// dark-mode ones -- email clients render on a white canvas, and the
// dark-mode pair (--green:#5dcaa5 on --green-dark:#0d2218) was tuned for a
// near-black page background, not a white one. #1a7a5e (light theme's
// --green) is the one actually built for white-background contrast, and
// it's what the one email in this codebase that already had a styled
// button (notifyAdminOfPendingClaim) had independently landed on too.
const GREEN = "#1a7a5e";
const GREEN_TINT = "#edf7f3";
const INK = "#1a1a1a";
const MUTED = "#6b6f6b";
const BORDER = "#e5e7e5";

// Email-safe font stacks only -- web fonts (Fraunces/DM Sans) aren't
// reliably loadable in email clients, so these are the closest system-font
// equivalents in spirit (serif display / clean sans body), same
// office-safe-substitute reasoning the pitch deck used for Georgia.
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// User-controlled strings (event names, registrant names, community names)
// get interpolated directly into these HTML emails -- escaped so a name
// containing "<" or "&" can't break the layout or inject markup.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailButton(label: string, href: string) {
  return `<a href="${href}" style="display:inline-block;padding:14px 30px;background:${GREEN};color:#ffffff;border-radius:999px;text-decoration:none;font-family:${SANS};font-weight:700;font-size:15px;">${label}</a>`;
}

// A lighter, secondary-action variant -- e.g. "Reject" next to "Approve",
// where both need a button but only one should read as the primary action.
export function emailButtonSecondary(label: string, href: string) {
  return `<a href="${href}" style="display:inline-block;padding:14px 30px;background:#f3f4f2;color:${INK};border-radius:999px;text-decoration:none;font-family:${SANS};font-weight:700;font-size:15px;">${label}</a>`;
}

/** A highlighted info block -- event date/venue, a UPI ID, a QR code -- set
 * off from body copy with the same light-mint tint used on-site for badges. */
export function emailCallout(html: string) {
  return `<div style="background:${GREEN_TINT};border-radius:12px;padding:18px 20px;margin:20px 0;font-family:${SANS};font-size:14px;color:${INK};">${html}</div>`;
}

export function renderEmailShell({ preheader, bodyHtml }: { preheader: string; bodyHtml: string }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f5f6f4;">
  <!-- Preheader: hidden preview text shown next to the subject line in inbox lists -- not visible once the email is open. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 8px 20px;font-family:${SERIF};font-size:22px;font-weight:700;color:${INK};">
              Close<span style="color:${GREEN};">connect</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:36px 32px;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;font-family:${SANS};font-size:12px;color:${MUTED};">
              <p style="margin:0 0 6px;">
                <a href="mailto:support@closeconnect.in" style="color:${MUTED};text-decoration:underline;">Support</a>
                &nbsp;&middot;&nbsp;
                <a href="tel:+918310109935" style="color:${MUTED};text-decoration:underline;">+91 83101 09935</a>
                &nbsp;&middot;&nbsp;
                <a href="tel:+919449175913" style="color:${MUTED};text-decoration:underline;">+91 94491 75913</a>
                &nbsp;&middot;&nbsp;
                <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://closeconnect.in"}/terms" style="color:${MUTED};text-decoration:underline;">Terms</a>
                &nbsp;&middot;&nbsp;
                <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://closeconnect.in"}/privacy" style="color:${MUTED};text-decoration:underline;">Privacy</a>
              </p>
              <p style="margin:0;">&copy; ${new Date().getFullYear()} CloseConnect</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
