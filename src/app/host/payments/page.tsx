import Link from "next/link";
import { IconArrowLeft, IconCashBanknote } from "@tabler/icons-react";
import { getMyPayoutAccount, getMySettlements } from "@/app/actions/organizerPayouts";
import { PayoutAccountForm } from "@/components/payments/PayoutAccountForm";
import { SettlementHistory } from "@/components/payments/SettlementHistory";

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default async function HostPaymentsPage() {
  const [account, settlements] = await Promise.all([getMyPayoutAccount(), getMySettlements()]);

  const totalEarnedPaise = settlements.reduce((sum, s) => sum + s.netPayablePaise, 0);
  const totalRefundsPaise = settlements.reduce((sum, s) => sum + s.refundAmountPaise, 0);
  const totalFeesPaise = settlements.reduce((sum, s) => sum + s.platformFeePaise, 0);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/host/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2">
          <IconArrowLeft size={14} />
          Back to dashboard
        </Link>
        <h1 className="flex items-center gap-2 font-heading text-[22px] font-bold leading-tight">
          <IconCashBanknote size={20} className="text-purple" />
          Payments &amp; Payouts
        </h1>
        <p className="mt-1 text-[14px] text-text3">Add and verify your payout account to receive money from your event sales.</p>

        {!account && (
          <div className="mt-4 rounded-card border border-pink/40 bg-pink-tint p-4 text-[13px] text-text">
            Your payout account isn&apos;t configured yet. Customers can still buy tickets, but you won&apos;t be eligible for
            settlement until your payout account is added and verified.
          </div>
        )}

        <section className="mt-6">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Payout account</h2>
          <PayoutAccountForm account={account} />
        </section>

        <section className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
          <div className="rounded-card border border-border bg-bg2 p-3">
            <p className="text-[11px] text-text3">Net earnings</p>
            <p className="mt-1 font-heading text-[16px] font-bold text-text">{rupees(totalEarnedPaise)}</p>
          </div>
          <div className="rounded-card border border-border bg-bg2 p-3">
            <p className="text-[11px] text-text3">Refunds</p>
            <p className="mt-1 font-heading text-[16px] font-bold text-text">{rupees(totalRefundsPaise)}</p>
          </div>
          <div className="rounded-card border border-border bg-bg2 p-3">
            <p className="text-[11px] text-text3">Platform fees</p>
            <p className="mt-1 font-heading text-[16px] font-bold text-text">{rupees(totalFeesPaise)}</p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Settlement history</h2>
          <SettlementHistory settlements={settlements} />
        </section>
      </div>
    </div>
  );
}
