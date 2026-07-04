// Real cross-user RLS proof, not a policy-exists check.
// Creates two live test users, signs in as each, and drives actual
// Postgrest requests through their sessions to prove User A cannot
// read/write User B's data (and vice versa), per SPEC.md Section 11.
//
// Run: node --env-file=.env.local supabase/tests/rls.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const anonClient = () => createClient(URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

// RLS-blocked UPDATE/DELETE affect 0 rows silently (no error) when the
// row is invisible under the USING clause -- this is the exact silent-
// failure mode SPEC.md calls out from the current production app.
function blockedByEmptyResult(data, error) {
  if (error) return true;
  return Array.isArray(data) && data.length === 0;
}

async function main() {
  const stamp = Date.now();
  const userA = { email: `rls-test-a-${stamp}@example.com`, password: "Test-Pass-A-1234!" };
  const userB = { email: `rls-test-b-${stamp}@example.com`, password: "Test-Pass-B-1234!" };

  console.log("\n== Setup: creating two confirmed test users ==");
  const { data: createdA, error: errA } = await admin.auth.admin.createUser({
    email: userA.email, password: userA.password, email_confirm: true,
  });
  const { data: createdB, error: errB } = await admin.auth.admin.createUser({
    email: userB.email, password: userB.password, email_confirm: true,
  });
  if (errA || errB) {
    console.error("Failed to create test users:", errA?.message, errB?.message);
    process.exit(1);
  }
  const aId = createdA.user.id;
  const bId = createdB.user.id;
  console.log(`User A: ${aId}\nUser B: ${bId}`);

  const clientA = anonClient();
  const clientB = anonClient();
  const clientAnon = anonClient(); // never signs in -- unauthenticated stranger

  const { error: signInAErr } = await clientA.auth.signInWithPassword(userA);
  const { error: signInBErr } = await clientB.auth.signInWithPassword(userB);
  if (signInAErr || signInBErr) {
    console.error("Sign-in failed:", signInAErr?.message, signInBErr?.message);
    process.exit(1);
  }

  // Declared here (not inside `try`) so the `finally` cleanup block below can
  // still see them even if a step throws before they'd normally be assigned.
  let communityOpenId, communityRequestId, eventId;

  try {
    // ---------------------------------------------------------------
    console.log("\n== profiles ==");
    {
      const { data } = await clientB.from("profiles").select("id").eq("id", aId);
      record("B can read A's profile (public select)", data?.length === 1);

      const { data: upd, error } = await clientB
        .from("profiles").update({ display_name: "hijacked" }).eq("id", aId).select();
      record("B cannot update A's profile", blockedByEmptyResult(upd, error));
    }

    // ---------------------------------------------------------------
    console.log("\n== communities ==");
    {
      const { data: created, error } = await clientA
        .from("communities")
        .insert({ name: `Open Co ${stamp}`, description: "d", category: "sports", kind: "native", join_mode: "open", owner_id: aId })
        .select().single();
      record("A can create a community they own", !!created && !error, error?.message);
      communityOpenId = created?.id;

      const { data: created2 } = await clientA
        .from("communities")
        .insert({ name: `Request Co ${stamp}`, description: "d", category: "sports", kind: "native", join_mode: "request", owner_id: aId })
        .select().single();
      communityRequestId = created2?.id;

      const { data: upd, error: updErr } = await clientB
        .from("communities").update({ name: "hijacked" }).eq("id", communityOpenId).select();
      record("B cannot update A's community", blockedByEmptyResult(upd, updErr));

      const { data: del, error: delErr } = await clientB
        .from("communities").delete().eq("id", communityOpenId).select();
      record("B cannot delete A's community", blockedByEmptyResult(del, delErr));

      const { data: pub } = await clientAnon.from("communities").select("id").eq("id", communityOpenId);
      record("Unauthenticated stranger can read A's active community", pub?.length === 1);

      const { data: selfUpd, error: selfErr } = await clientA
        .from("communities").update({ description: "updated by owner" }).eq("id", communityOpenId).select();
      record("A can update their own community", selfUpd?.length === 1, selfErr?.message);
    }

    // ---------------------------------------------------------------
    console.log("\n== community_groups (default groups + staff-only writes) ==");
    {
      const { data: groups } = await admin.from("community_groups").select("*").eq("community_id", communityOpenId);
      record("Community auto-got default General + Announcements groups", groups?.length === 2, `found ${groups?.length}`);

      const { data: ins, error } = await clientB
        .from("community_groups").insert({ community_id: communityOpenId, name: "B's rogue group" }).select();
      record("B (non-member) cannot create a group in A's community", blockedByEmptyResult(ins, error) || !!error);
    }

    // ---------------------------------------------------------------
    console.log("\n== community join flow (open + request modes) ==");
    {
      // Open join: B self-submits an already-approved form_response.
      const { data: openJoin, error: openErr } = await clientB
        .from("form_responses")
        .insert({ owner_type: "community", owner_id: communityOpenId, respondent_id: bId, response_data: {}, status: "approved" })
        .select().single();
      record("B can self-join an open community via form_responses", !!openJoin && !openErr, openErr?.message);

      const { data: membership } = await admin
        .from("community_members").select("*").eq("community_id", communityOpenId).eq("user_id", bId);
      record("Trigger created B's community_members row for the open join", membership?.length === 1);

      const { data: defaultGroups } = await admin.from("community_groups").select("id").eq("community_id", communityOpenId).eq("is_default", true);
      const { data: groupMembership } = await admin
        .from("community_group_members").select("group_id").eq("user_id", bId).in("group_id", (defaultGroups ?? []).map(g => g.id));
      record("Trigger also joined B to the default groups", groupMembership?.length === (defaultGroups?.length ?? -1));

      // Double-submission: re-approving shouldn't duplicate the membership row.
      if (openJoin) await clientB.from("form_responses").update({ status: "approved" }).eq("id", openJoin.id);
      const { data: afterDup } = await admin
        .from("community_members").select("*").eq("community_id", communityOpenId).eq("user_id", bId);
      record("Double-submission does not duplicate community_members row", afterDup?.length === 1);

      // Request-mode: B cannot self-approve.
      const { data: bypass, error: bypassErr } = await clientB
        .from("form_responses")
        .insert({ owner_type: "community", owner_id: communityRequestId, respondent_id: bId, response_data: {}, status: "approved" })
        .select();
      record("B cannot self-submit 'approved' on a request-mode community (bypass attempt)", blockedByEmptyResult(bypass, bypassErr) || !!bypassErr);

      const { data: pending, error: pendingErr } = await clientB
        .from("form_responses")
        .insert({ owner_type: "community", owner_id: communityRequestId, respondent_id: bId, response_data: { why: "let me in" }, status: "pending" })
        .select().single();
      record("B can submit a pending join-request instead", !!pending && !pendingErr, pendingErr?.message);

      const { data: bReadOwn } = await clientB.from("form_responses").select("id").eq("id", pending?.id ?? "00000000-0000-0000-0000-000000000000");
      record("B can read their own pending join-request", bReadOwn?.length === 1);

      const { data: approve, error: approveErr } = pending
        ? await clientA.from("form_responses").update({ status: "approved" }).eq("id", pending.id).select()
        : { data: [], error: null };
      record("A (owner) can approve B's join-request", approve?.length === 1, approveErr?.message);

      const { data: reqMembership } = await admin
        .from("community_members").select("*").eq("community_id", communityRequestId).eq("user_id", bId);
      record("Approval trigger created B's membership for the request-mode community", reqMembership?.length === 1);
    }

    // ---------------------------------------------------------------
    console.log("\n== community_messages (chat scoped to group, not community) ==");
    {
      const { data: generalGroup } = await admin
        .from("community_groups").select("id").eq("community_id", communityOpenId).eq("name", "General").single();

      const { data: msg, error: msgErr } = await clientB
        .from("community_messages").insert({ group_id: generalGroup.id, user_id: bId, content: "hi from B" }).select().single();
      record("B (group member) can post in the group", !!msg && !msgErr, msgErr?.message);

      const { data: strangerRead } = await clientAnon.from("community_messages").select("id").eq("group_id", generalGroup.id);
      record("Unauthenticated stranger cannot read group chat", (strangerRead?.length ?? 0) === 0);
    }

    // ---------------------------------------------------------------
    console.log("\n== events ==");
    {
      const { data: created, error } = await clientA
        .from("events")
        .insert({ host_id: aId, event_name: `A's Event ${stamp}`, event_date: "2026-12-01" })
        .select().single();
      record("A can create an event hosting themselves", !!created && !error, error?.message);
      eventId = created?.id;

      const { data: impersonate, error: impErr } = await clientB
        .from("events")
        .insert({ host_id: aId, event_name: "impersonated event", event_date: "2026-12-01" })
        .select();
      record("B cannot create an event claiming A as host", blockedByEmptyResult(impersonate, impErr) || !!impErr);

      const { data: upd, error: updErr } = await clientB
        .from("events").update({ event_name: "hijacked" }).eq("id", eventId).select();
      record("B cannot update A's event", blockedByEmptyResult(upd, updErr));

      const { data: crossCommunity, error: ccErr } = await clientB
        .from("events")
        .insert({ host_id: bId, community_id: communityOpenId, event_name: "B piggybacking A's community", event_date: "2026-12-01" })
        .select();
      record("B cannot attach an event to A's community without being staff there", blockedByEmptyResult(crossCommunity, ccErr) || !!ccErr);
    }

    // ---------------------------------------------------------------
    console.log("\n== event_ticket_types + form_fields (event-owner-only writes) ==");
    {
      const { data: ins, error } = await clientB
        .from("event_ticket_types").insert({ event_id: eventId, name: "B's rogue ticket" }).select();
      record("B cannot add a ticket type to A's event", blockedByEmptyResult(ins, error) || !!error);

      const { data: ownIns, error: ownErr } = await clientA
        .from("event_ticket_types").insert({ event_id: eventId, name: "General" }).select();
      record("A can add a ticket type to their own event", !!ownIns?.length && !ownErr, ownErr?.message);

      const { data: fieldIns, error: fieldErr } = await clientB
        .from("form_fields").insert({ owner_type: "event", owner_id: eventId, label: "rogue field", field_type: "text" }).select();
      record("B cannot add a form field to A's event", blockedByEmptyResult(fieldIns, fieldErr) || !!fieldErr);
    }

    // ---------------------------------------------------------------
    console.log("\n== form_responses (PII -- never publicly readable) ==");
    {
      // Guests can't chain .select() here: an anonymous respondent_id=null row
      // fails their own SELECT policy (no owner match, no respondent match),
      // so real client code must treat "no error" as success and not read the
      // row back in the same request. Fetch the id via admin purely so this
      // test script can make later assertions about it.
      const { error: guestErr } = await clientAnon
        .from("form_responses")
        .insert({ owner_type: "event", owner_id: eventId, respondent_id: null, response_data: { name: "Guest" }, status: "approved" });
      record("Unauthenticated guest can register for A's event", !guestErr, guestErr?.message);

      const { data: guestReg } = await admin
        .from("form_responses").select("id").eq("owner_type", "event").eq("owner_id", eventId).is("respondent_id", null).single();

      const { data: bReg, error: bRegErr } = await clientB
        .from("form_responses")
        .insert({ owner_type: "event", owner_id: eventId, respondent_id: bId, response_data: { name: "B" }, status: "approved" })
        .select().single();
      record("B can register for A's event under their own identity", !!bReg && !bRegErr, bRegErr?.message);

      const { data: bReadOthers } = guestReg
        ? await clientB.from("form_responses").select("id").eq("id", guestReg.id)
        : { data: null };
      record("B cannot read the guest's registration (not owner, not respondent)", (bReadOthers?.length ?? 0) === 0);

      const { data: aReadAll } = await clientA.from("form_responses").select("id").eq("owner_type", "event").eq("owner_id", eventId);
      record("A (event host) can read all registrants for their event", (aReadAll?.length ?? 0) === 2);

      const { data: bCheckIn, error: bCheckInErr } = guestReg
        ? await clientB.from("form_responses").update({ checked_in_at: new Date().toISOString() }).eq("id", guestReg.id).select()
        : { data: [], error: null };
      record("B cannot check in a registrant on A's event", blockedByEmptyResult(bCheckIn, bCheckInErr));
    }

    // ---------------------------------------------------------------
    console.log("\n== reports (admin-only visibility) ==");
    {
      // Reports are select:admin-only per spec, with no self-visibility carve-out --
      // so, like the guest registration above, the filer can't read their own
      // report back. Real client code just checks for no error; fetch via
      // admin here purely so this script can assert on it afterward.
      const { error: repErr } = await clientB
        .from("reports").insert({ target_type: "community", target_id: communityOpenId, reporter_id: bId, reason: "test" });
      record("B can file a report", !repErr, repErr?.message);

      const { data: rep } = await admin.from("reports").select("id").eq("reporter_id", bId).single();

      const { data: bReadReports } = await clientB.from("reports").select("id");
      record("B (non-admin) cannot list reports", (bReadReports?.length ?? 0) === 0);

      const { data: bResolve, error: bResolveErr } = rep
        ? await clientB.from("reports").update({ status: "resolved" }).eq("id", rep.id).select()
        : { data: [], error: null };
      record("B cannot resolve their own report (admin only)", blockedByEmptyResult(bResolve, bResolveErr));
    }
  } finally {
    console.log("\n== Cleanup ==");
    // owner_id/host_id/reporter_id/respondent_id -> profiles have no ON DELETE
    // CASCADE (by design, per SPEC.md -- profiles are never auto-deleted out
    // from under owned content), so remove owned rows before deleting the
    // users themselves or the deletes silently fail underneath a swallowed error.
    const ids = [aId, bId].filter(Boolean);
    const ownerIds = [communityOpenId, communityRequestId, eventId].filter(Boolean);
    // form_responses/form_fields are polymorphic (owner_id has no real FK), so
    // deleting the parent community/event doesn't cascade them away -- and a
    // guest registration has respondent_id = null, so it isn't caught by the
    // respondent_id filter either. Catch both.
    if (ownerIds.length) await admin.from("form_responses").delete().in("owner_id", ownerIds);
    await admin.from("form_responses").delete().in("respondent_id", ids);
    await admin.from("reports").delete().in("reporter_id", ids);
    await admin.from("events").delete().in("host_id", ids);
    await admin.from("communities").delete().in("owner_id", ids);
    for (const id of ids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.error(`  Failed to delete test user ${id}: ${error.message}`);
    }
  }

  console.log("\n================ SUMMARY ================");
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFAILED:");
    failed.forEach(f => console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
