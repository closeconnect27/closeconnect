import { createAdminClient } from "@/lib/supabase/admin";

// Direct one-click approve/reject from the claim notification email -- a
// GET request mutates the claims table on click, per explicit product
// decision. This is knowingly weaker than a confirm-page pattern: email
// clients/security scanners that pre-fetch links could trigger a decision
// with no human behind it. The one guard in place is that the update below
// is scoped to `status = 'pending'`, so only the first decision (whichever
// link -- or prefetch -- lands first) ever takes effect; a second click on
// either link is a no-op that reports "already reviewed" instead of
// flipping the outcome.
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f7f7f5;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#555;font-size:14px;line-height:1.5;margin:0}</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${body}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (error) {
    return page("Something went wrong", escapeHtml(error.message), 500);
  }

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
