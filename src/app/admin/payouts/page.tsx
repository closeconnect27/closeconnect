import { redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCashBanknote } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllSettlementsForAdmin } from "@/app/actions/organizerPayouts";
import { AdminSettlementsSection } from "@/components/admin/AdminSettlementsSection";

// Admin-only, same gate as /admin itself. Backed by organizer_settlements
// (0146) -- a correctly-computed ledger (gross sales, refunds, platform
// fee, net payable) rather than the earlier naive "price * quantity of
// paid-not-forwarded registrations" estimate this page used to show.
export default async function AdminPayoutsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/host/dashboard");

  const settlements = await getAllSettlementsForAdmin();
  const totalPayablePaise = settlements.filter((s) => s.status !== "processed").reduce((sum, s) => sum + s.netPayablePaise, 0);

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
          Every ticket payment lands in the platform&apos;s own Razorpay account -- this is each event&apos;s computed
          settlement (gross sales, refunds, platform fee, net payable) and its payout status. An eligible settlement is
          paid out automatically via Razorpay; use &quot;Mark paid manually&quot; only when that isn&apos;t possible.
        </p>

        <div className="mt-6 card-elevated rounded-card bg-bg2 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-text3">Total currently payable</p>
          <p className="mt-1 font-heading text-[28px] font-bold text-text">₹{(totalPayablePaise / 100).toLocaleString("en-IN")}</p>
        </div>

        <AdminSettlementsSection settlements={settlements} />
      </div>
    </div>
  );
}
