import type { SupabaseClient } from "@supabase/supabase-js";

export type Report = {
  id: string;
  target_type: "community" | "event" | "message" | "user";
  target_id: string;
  reporter_id: string | null;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export type ResolvedReport = Report & {
  targetLabel: string;
  targetHref: string | null;
  reporterName: string;
};

/** Admin-only (RLS: reports_select_admin, 0001) -- the admin dashboard's
 * moderation queue. target_id is polymorphic across 4 different tables
 * (same shape as verification_requests/claims elsewhere in this schema),
 * so labels are resolved in a second pass and merged in JS rather than a
 * single PostgREST embed. Message resolution needs
 * community_messages_select_admin (0056) -- the existing message RLS only
 * grants group-membership or community-staff access, neither of which a
 * platform admin necessarily has for an arbitrary reported message. */
export async function getOpenReports(supabase: SupabaseClient): Promise<ResolvedReport[]> {
  const { data: reports, error } = await supabase
    .from("reports")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!reports || reports.length === 0) return [];

  const communityIds = reports.filter((r) => r.target_type === "community").map((r) => r.target_id as string);
  const eventIds = reports.filter((r) => r.target_type === "event").map((r) => r.target_id as string);
  const userIds = reports.filter((r) => r.target_type === "user").map((r) => r.target_id as string);
  const messageIds = reports.filter((r) => r.target_type === "message").map((r) => r.target_id as string);
  const reporterIds = [...new Set(reports.map((r) => r.reporter_id as string | null).filter((v): v is string => !!v))];

  const [{ data: communities }, { data: events }, { data: users }, { data: messages }, { data: reporters }] = await Promise.all([
    communityIds.length
      ? supabase.from("communities").select("id, name").in("id", communityIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    eventIds.length
      ? supabase.from("events").select("id, event_name").in("id", eventIds)
      : Promise.resolve({ data: [] as { id: string; event_name: string }[] }),
    userIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    messageIds.length
      ? supabase
          .from("community_messages")
          .select("id, content, group_id, community_groups(community_id, name)")
          .in("id", messageIds)
      : Promise.resolve({ data: [] as { id: string; content: string | null; group_id: string; community_groups: { community_id: string; name: string } | null }[] }),
    reporterIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", reporterIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);

  const communityById = new Map((communities ?? []).map((c) => [c.id, c]));
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const messageById = new Map((messages ?? []).map((m) => [m.id, m as unknown as { id: string; content: string | null; group_id: string; community_groups: { community_id: string; name: string } | null }]));
  const reporterNameById = new Map((reporters ?? []).map((r) => [r.id, r.display_name]));

  return reports.map((r) => {
    let targetLabel = "Unknown";
    let targetHref: string | null = null;

    if (r.target_type === "community") {
      const c = communityById.get(r.target_id);
      targetLabel = c?.name ?? "Unknown community";
      targetHref = `/communities/${r.target_id}`;
    } else if (r.target_type === "event") {
      const e = eventById.get(r.target_id);
      targetLabel = e?.event_name ?? "Unknown event";
      targetHref = `/events/${r.target_id}`;
    } else if (r.target_type === "user") {
      const u = userById.get(r.target_id);
      targetLabel = u?.display_name ?? "Unknown user";
      targetHref = `/profile/${r.target_id}`;
    } else if (r.target_type === "message") {
      const m = messageById.get(r.target_id);
      targetLabel = m?.content ? `"${m.content.slice(0, 80)}"` : "[message with no text, e.g. an attachment]";
      targetHref = m?.community_groups?.community_id ? `/communities/${m.community_groups.community_id}` : null;
    }

    return {
      ...r,
      targetLabel,
      targetHref,
      reporterName: r.reporter_id ? reporterNameById.get(r.reporter_id) ?? "Someone" : "Someone",
    } as ResolvedReport;
  });
}
