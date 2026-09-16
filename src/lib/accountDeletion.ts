import { createAdminClient } from "@/lib/supabase/admin";

// Shared by the web Server Action (src/app/actions/account.ts) and the
// mobile route (src/app/api/mobile/account/delete/route.ts) -- both just
// authenticate the caller their own way and hand off the user id here.
//
// This is an anonymize-in-place deletion, not a hard row delete:
// communities.owner_id, events.host_id, community_messages.user_id etc. are
// NOT NULL / ON DELETE NO ACTION (not cascade) by design (0001_init.sql) --
// a real hard delete of a user who's ever hosted an event or sent a group
// message would fail outright on the FK, or silently orphan other people's
// chat history and event attendance records. Anonymizing keeps every
// reference intact (a past message's author just displays as "Deleted
// user") while actually satisfying "delete my data": login is permanently
// blocked, and every column that identifies the person is cleared.
// Financial/ticket records (form_responses, payment fields) are
// deliberately left untouched -- kept for the same legal/accounting
// retention reasons named on the /account-deletion page, not an oversight.
export async function deleteAccountById(userId: string): Promise<{ error: string | null }> {
  const admin = createAdminClient();

  // Real gap found live: without this check, deleting an account that owns
  // a community anonymizes the owner in place (owner_id still points at
  // them, just now "Deleted user") -- the community is left permanently
  // ownerless-in-spirit, with no host to manage it, approve join requests,
  // or ever be message-host'd. Blocked up front, before anything else
  // below runs, so a rejected deletion attempt doesn't still end up
  // banning/scrambling the account. Matches web's own leave-community
  // flow (LeaveCommunitySection), which requires picking a successor
  // before an owner can leave -- deletion is at least as permanent as
  // leaving, so it gets at least as strict a gate.
  const { data: ownedCommunities, error: ownedError } = await admin.from("communities").select("name").eq("owner_id", userId);
  if (ownedError) return { error: ownedError.message };
  if (ownedCommunities && ownedCommunities.length > 0) {
    const names = ownedCommunities.map((c) => c.name).slice(0, 5).join(", ");
    const more = ownedCommunities.length > 5 ? ` and ${ownedCommunities.length - 5} more` : "";
    return {
      error: `You own ${ownedCommunities.length} ${ownedCommunities.length === 1 ? "community" : "communities"} (${names}${more}). Transfer ownership to another member before deleting your account.`,
    };
  }

  // Blocks all future logins immediately and frees the email/phone for
  // reuse. ban_duration doesn't revoke an already-issued access token
  // (those just expire naturally, normally within the hour) -- the caller
  // signs out locally right after this resolves, which ends the practical
  // session immediately on that device regardless.
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    email: `deleted-${userId}@closeconnect.invalid`,
    phone: "",
    password: crypto.randomUUID(),
  });
  if (authError) return { error: authError.message };

  // Real bug found live: updateUserById only changes auth.users.email --
  // anyone who originally signed up via Google (or any OAuth provider) has
  // a SEPARATE auth.identities row whose own identity_data.email still
  // holds the real address. Without clearing it, that email/Google account
  // could never be used to sign up again -- GoTrue resolves it to this
  // now-banned identity and returns "user is banned" instead of creating a
  // fresh account. There's no Admin API endpoint for this (confirmed: the
  // identity-delete REST route 404s), so it goes through a migration-
  // defined function that reaches auth.identities directly (0122).
  await admin.rpc("clear_user_identities", { p_user_id: userId });

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: "Deleted user",
      avatar_url: null,
      bio: null,
      bio_content: null,
      interests: null,
      username: null,
      date_of_birth: null,
      gender: null,
      profile_visibility: "private",
    })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  await admin
    .from("profile_details")
    .update({
      bio: null,
      interests: null,
      occupation: null,
      company: null,
      college: null,
      linkedin_url: null,
      github_url: null,
      instagram_url: null,
      skills: [],
      profile_visibility: "private",
    })
    .eq("id", userId);

  await admin.from("push_tokens").delete().eq("user_id", userId);
  await admin.from("blocked_users").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  // Real gap found live: leaving these rows in place (just anonymized via
  // the profile update above) made a deleted account show up as "Deleted
  // user" in every community's members list -- confusing for an active
  // roster in a way that showing "Deleted user" as a past message's author
  // isn't. Membership isn't historically load-bearing the way authorship
  // or hosting is, so it's removed outright rather than anonymized.
  // community_members_count_sync (0001_init.sql) reacts to this delete and
  // keeps each community's member_count correct on its own.
  await admin.from("community_members").delete().eq("user_id", userId);
  await admin.from("community_group_members").delete().eq("user_id", userId);

  return { error: null };
}
