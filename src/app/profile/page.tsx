import Link from "next/link";
import { IconLayoutDashboard } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

// Minimal stub -- the full profile page (joined communities, hosted events,
// ratings given, edit bio/avatar) is its own future phase, not part of this
// design pass. The host dashboard link is the one exception: it's a real,
// already-built Phase 9 feature, and a link-less page is how the sign-in
// button ended up invisible earlier in this project -- not repeating that.
export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const initial = (profile?.display_name ?? user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="card-elevated flex w-full max-w-sm flex-col items-center gap-4 rounded-card bg-bg2 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-tint text-[24px] font-bold text-green">
          {initial}
        </div>
        <div>
          <h1 className="font-heading text-[20px] font-extrabold">
            {profile?.display_name ?? "Your profile"}
          </h1>
          <p className="text-[13px] text-text3">{user.email}</p>
        </div>
        <Link href="/host/dashboard" className="btn-primary w-full py-2.5 text-[13px]">
          <IconLayoutDashboard size={14} />
          Host dashboard
        </Link>
        <form action={signOut} className="w-full">
          <button type="submit" className="btn-secondary w-full py-2.5 text-[13px]">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
