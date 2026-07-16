import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getHostableCommunities } from "@/lib/queries/events";
import { getHostPaymentDetails } from "@/lib/queries/paymentDetails";
import { NewEventForm } from "@/components/events/NewEventForm";

export default async function NewEventPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [hostableCommunities, paymentDetails] = await Promise.all([
    getHostableCommunities(supabase, user.id),
    getHostPaymentDetails(supabase, user.id),
  ]);

  return <NewEventForm hostableCommunities={hostableCommunities} userId={user.id} paymentDetails={paymentDetails} />;
}
