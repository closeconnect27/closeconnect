import { redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCashBanknote } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayoutSummary } from "@/lib/queries/payouts";
import { PayoutSummarySection } from "@/components/admin/PayoutSummarySection";

// Admin-only, same gate as /admin itself -- all money currently lands in
// this platform's own single Razorpay account (0065), so "who's owed what"
// only exists as a computed view over this app's own data, not anything
// Razorpay itself knows about.
export default async function AdminPayoutsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/host/dashboard");

  const admin = createAdminClient();
  const organizers = await getPayoutSummary(admin);
  const totalOwed = organizers.reduce((sum, o) => sum + o.totalOwedRupees, 0);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2">
          <IconArrowLeft size={14} />
          Back to admin
        </Link>
        <h1 className="flex items-center gap-2 font-heading text-[18px] font-bold leading-tight">
          <IconCashBanknote size={20} className="text-purple" />
          Organizer payouts
        </h1>
        <p className="text-[14px] text-text3">
          Every ticket payment lands in the platform&apos;s own Razorpay account, regardless of host -- this is what&apos;s
          still owed to each organizer, computed from paid registrations that haven&apos;t been marked forwarded yet.
          Transferring the money itself (bank transfer/UPI) still happens outside this app.
        </p>

        <div className="mt-6 card-elevated rounded-card bg-bg2 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-text3">Total currently owed</p>
          <p className="mt-1 font-heading text-[28px] font-bold text-text">₹{totalOwed.toLocaleString("en-IN")}</p>
        </div>

        <PayoutSummarySection organizers={organizers} />
      </div>
    </div>
  );
}
