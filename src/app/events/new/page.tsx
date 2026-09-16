import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getHostableCommunities } from "@/lib/queries/events";
import { NewEventForm } from "@/components/events/NewEventForm";

export default async function NewEventPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const hostableCommunities = await getHostableCommunities(supabase, user.id);

  return <NewEventForm hostableCommunities={hostableCommunities} />;
}
