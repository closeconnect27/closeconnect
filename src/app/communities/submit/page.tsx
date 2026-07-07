import { SubmitExternalCommunityForm } from "@/components/communities/SubmitExternalCommunityForm";

// Deliberately not in proxy.ts's PROTECTED_PREFIXES -- public, no login
// required, same as browsing. This is the "I know a community that should
// be in this directory" path; /communities/new is the separate "I want to
// run a native community here" path.
export default function SubmitCommunityPage() {
  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-[18px] font-bold leading-tight">Add a community</h1>
        <p className="mb-8 text-[14px] text-text3">
          Know a WhatsApp group or Instagram page that belongs here? List it -- no account needed. The real
          owner can claim it from the listing&apos;s page once it&apos;s up.
        </p>
        <SubmitExternalCommunityForm />
      </div>
    </div>
  );
}
