import Link from "next/link";
import { IconCashBanknote } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getHostableCommunities } from "@/lib/queries/events";
import { getMyPayoutAccount } from "@/app/actions/organizerPayouts";
import { NewEventForm } from "@/components/events/NewEventForm";

export default async function NewEventPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const hostableCommunities = await getHostableCommunities(supabase, user.id);

  // A DB trigger (0156) is the real enforcement -- this is just the
  // friendly version of it, so a first-time host sees a clear prompt
  // instead of a raw Postgres exception after filling out the whole form.
  const { count: hostedEventCount } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("host_id", user.id);
  if (!hostedEventCount) {
    const payoutAccount = await getMyPayoutAccount();
    if (!payoutAccount) {
      return (
        <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
          <div className="mx-auto max-w-md rounded-card border border-border bg-bg2 p-6 text-center">
            <IconCashBanknote size={28} className="mx-auto text-purple" />
            <h1 className="mt-3 font-heading text-[18px] font-bold">Add a payout account first</h1>
            <p className="mt-2 text-[14px] text-text3">
              Before hosting your first event, add the bank account you want ticket sales settled to. It only takes a minute, and
              verification runs in the background.
            </p>
            <Link href="/host/payments" className="btn-primary mt-4 inline-flex px-6 py-2.5 text-[14px]">
              Add payout account
            </Link>
          </div>
        </div>
      );
    }
  }

  return <NewEventForm hostableCommunities={hostableCommunities} />;
}
