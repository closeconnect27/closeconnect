import type { Metadata } from "next";
import { listPlatformFaqs } from "@/app/actions/platformFaqs";
import { PlatformFaqBrowser } from "@/components/faqs/PlatformFaqBrowser";

export const metadata: Metadata = { title: "Help & FAQ" };

// Public, database-driven (platform_faqs, admin-managed at /admin/faqs) --
// same static-page container convention as terms/privacy/cancellation-refund.
export default async function FaqsPage() {
  const faqs = await listPlatformFaqs();
  const published = faqs.filter((f) => f.is_published);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-[24px] font-bold leading-tight">Frequently Asked Questions</h1>
      <p className="mt-1 text-[13px] text-text3">Answers about using CloseConnect. Looking for something about a specific event? Check that event&apos;s own FAQ on its page.</p>

      <div className="mt-6">
        <PlatformFaqBrowser faqs={published} />
      </div>

      <p className="mt-8 text-[13px] text-text3">
        Can&apos;t find what you&apos;re looking for?{" "}
        <a href="mailto:support@closeconnect.in" className="text-green hover:underline">
          Contact support
        </a>
        .
      </p>
    </div>
  );
}
