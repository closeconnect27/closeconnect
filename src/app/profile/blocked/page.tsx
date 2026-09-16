import Link from "next/link";
import { IconArrowLeft, IconBan } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUsers } from "@/lib/queries/profileDetails";
import { EmptyState } from "@/components/ui/EmptyState";
import { UnblockRow } from "@/components/profile/UnblockRow";

export const metadata = { title: "Blocked users" };

export default async function BlockedUsersPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const blocked = await getBlockedUsers(supabase, user.id);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <Link href="/profile" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2">
          <IconArrowLeft size={14} />
          Back to profile
        </Link>
        <h1 className="font-heading text-[18px] font-bold leading-tight">Blocked users</h1>
        <p className="mb-6 text-[14px] text-text3">
          People you've blocked can't follow you, message you, or reach out to communities/events you host.
        </p>

        {blocked.length === 0 ? (
          <EmptyState icon={IconBan} title="You haven't blocked anyone" compact />
        ) : (
          <div className="flex flex-col gap-2">
            {blocked.map((p) => (
              <UnblockRow key={p.id} person={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
