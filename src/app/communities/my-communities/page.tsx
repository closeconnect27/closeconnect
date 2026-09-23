import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyCommunities } from "@/lib/queries/communities";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconUsersGroup } from "@tabler/icons-react";

export const metadata = { title: "My communities" };

export default async function MyCommunitiesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const communities = await getMyCommunities(supabase, user.id);

  return (
    <div className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-heading text-[22px] font-bold text-text">My communities</h1>
        <Link href="/communities" className="text-[13px] text-text3 transition hover:text-text2">
          ← Back to communities
        </Link>
      </div>

      {communities.length === 0 ? (
        <EmptyState
          icon={IconUsersGroup}
          title="No communities yet"
          description="Communities you join or create will show up here."
          action={{ label: "Browse communities", href: "/communities" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((c) => (
            <CommunityCard key={c.id} community={c} />
          ))}
        </div>
      )}
    </div>
  );
}
