import { createAdminClient } from "@/lib/supabase/admin";

// The claim notification email links here. Decisions are only ever applied
// on POST (an explicit form submit a human clicked), not GET -- GET just
// renders a confirm page. This used to mutate directly on GET, which email
// link-scanners/prefetchers (common on corporate mail) could silently
// trigger with no human behind it. The one guard already in place, kept
// as-is: the update is scoped to `status = 'pending'`, so only the first
// decision to land ever takes effect; anything after that is a no-op that
// reports "already reviewed" instead of flipping the outcome.
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f7f7f5;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#555;font-size:14px;line-height:1.5;margin:16px 0}
button{border:none;border-radius:999px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer}
.approve{background:#1d9e75;color:#fff}.reject{background:#e5484d;color:#fff}</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${body}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function confirmPage(id: string, decision: string, communityName: string) {
  const label = decision === "approved" ? "Approve" : "Reject";
  const cls = decision === "approved" ? "approve" : "reject";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Confirm decision</title>
<style>body{font-family:system-ui,sans-serif;background:#f7f7f5;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#555;font-size:14px;line-height:1.5;margin:16px 0}
button{border:none;border-radius:999px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer}
.approve{background:#1d9e75;color:#fff}.reject{background:#e5484d;color:#fff}</style>
</head><body><div class="card"><h1>${label} this claim?</h1><p>Claim for <strong>${escapeHtml(communityName)}</strong>.</p>
<form method="POST"><button type="submit" class="${cls}">${label}</button></form></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function loadPendingClaim(id: string) {
  const admin = createAdminClient();
  return admin.from("claims").select("status, community_id, communities(name)").eq("id", id).maybeSingle();
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = new URL(request.url).searchParams.get("decision");
  if (decision !== "approved" && decision !== "rejected") {
    return page("Invalid link", "This decision link is malformed.", 400);
  }

  const { data: claim, error } = await loadPendingClaim(id);
  if (error) return page("Something went wrong", escapeHtml(error.message), 500);
  if (!claim) return page("Claim not found", "This claim no longer exists.", 404);
  if (claim.status !== "pending") {
    return page("Already reviewed", `This claim was already marked as <strong>${escapeHtml(claim.status)}</strong>.`);
  }

  const communityName = (claim.communities as unknown as { name: string } | null)?.name ?? "this community";
  return confirmPage(id, decision, communityName);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = new URL(request.url).searchParams.get("decision");
  if (decision !== "approved" && decision !== "rejected") {
    return page("Invalid link", "This decision link is malformed.", 400);
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("claims")
    .update({ status: decision })
    .eq("id", id)
    .eq("status", "pending")
    .select("community_id, communities(name)")
    .maybeSingle();

  if (error) return page("Something went wrong", escapeHtml(error.message), 500);

  if (!updated) {
    const { data: existing } = await admin.from("claims").select("status").eq("id", id).maybeSingle();
    if (!existing) return page("Claim not found", "This claim no longer exists.", 404);
    return page("Already reviewed", `This claim was already marked as <strong>${escapeHtml(existing.status)}</strong>.`);
  }

  const communityName = (updated.communities as unknown as { name: string } | null)?.name ?? "this community";
  return page(
    decision === "approved" ? "Claim approved" : "Claim rejected",
    `The claim for <strong>${escapeHtml(communityName)}</strong> has been ${decision}.`,
  );
}
