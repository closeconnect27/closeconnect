import { redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconHelpCircle } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listPlatformFaqs } from "@/app/actions/platformFaqs";
import { PlatformFaqAdmin } from "@/components/admin/PlatformFaqAdmin";

export default async function AdminFaqsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/host/dashboard");

  const faqs = await listPlatformFaqs();

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2">
          <IconArrowLeft size={14} />
          Back to admin
        </Link>
        <h1 className="flex items-center gap-2 font-heading text-[18px] font-bold leading-tight">
          <IconHelpCircle size={20} className="text-purple" />
          Platform FAQs
        </h1>
        <p className="mb-6 text-[14px] text-text3">
          Shown on the public <Link href="/faqs" className="text-green hover:underline">/faqs</Link> page. Unpublished FAQs stay hidden from everyone but admins.
        </p>

        <PlatformFaqAdmin faqs={faqs} />
      </div>
    </div>
  );
}
