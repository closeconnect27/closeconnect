import { redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconMessageQuestion } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listAllEventFaqsForAdmin } from "@/app/actions/eventFaqs";
import { EventFaqModerationSection } from "@/components/admin/EventFaqModerationSection";

export default async function AdminEventFaqsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/host/dashboard");

  const faqs = await listAllEventFaqsForAdmin();

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2">
          <IconArrowLeft size={14} />
          Back to admin
        </Link>
        <h1 className="flex items-center gap-2 font-heading text-[18px] font-bold leading-tight">
          <IconMessageQuestion size={20} className="text-purple" />
          Event FAQ moderation
        </h1>
        <p className="text-[14px] text-text3">The 200 most recently added event FAQs across every organizer. Hiding one removes it from public view without editing the organizer&apos;s own text.</p>

        <EventFaqModerationSection faqs={faqs} />
      </div>
    </div>
  );
}
