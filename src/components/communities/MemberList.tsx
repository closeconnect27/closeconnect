import { IconUsers } from "@tabler/icons-react";

export function MemberList({
  members,
  ownerId,
}: {
  members: { user_id: string; role: string; profiles: { display_name: string } | null }[];
  ownerId: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-text3">
        <IconUsers size={14} />
        {members.length} member{members.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-2">
        {members.slice(0, 20).map((m) => {
          const name = m.profiles?.display_name ?? "member";
          // communities.owner_id is authoritative -- always show "owner" for
          // that user regardless of what their (separate, mutable)
          // community_members.role row currently says.
          const displayRole = m.user_id === ownerId ? "owner" : m.role;
          return (
            <span
              key={m.user_id}
              className="flex items-center gap-2 rounded-full border border-border2 py-1 pl-1 pr-3 text-[12px] text-text2"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-tint text-[10px] font-bold text-green">
                {name.charAt(0).toUpperCase()}
              </span>
              {name}
              {displayRole !== "member" && <span className="font-semibold text-green">· {displayRole}</span>}
            </span>
          );
        })}
        {members.length > 20 && (
          <span className="flex items-center px-2 text-[12px] text-text3">
            +{members.length - 20} more
          </span>
        )}
      </div>
    </div>
  );
}
