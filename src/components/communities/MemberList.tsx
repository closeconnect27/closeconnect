import { IconUsers } from "@tabler/icons-react";

export function MemberList({
  members,
}: {
  members: { user_id: string; role: string; profiles: { display_name: string } | null }[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-text3">
        <IconUsers size={14} />
        {members.length} member{members.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {members.slice(0, 20).map((m) => (
          <span
            key={m.user_id}
            className="rounded-full border border-border2 px-2.5 py-1 text-[11px] text-text2"
          >
            {m.profiles?.display_name ?? "member"}
            {m.role !== "member" && <span className="text-green"> · {m.role}</span>}
          </span>
        ))}
        {members.length > 20 && (
          <span className="px-2.5 py-1 text-[11px] text-text3">+{members.length - 20} more</span>
        )}
      </div>
    </div>
  );
}
