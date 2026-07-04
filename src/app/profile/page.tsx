import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-2xl font-bold">Your profile</h1>
      <p className="text-text2">{user.email}</p>
      <p className="text-sm text-text3">
        display_name: {profile?.display_name ?? "(no profile row found)"}
      </p>
      <form action={signOut}>
        <button type="submit" className="rounded-full border border-border2 px-3 py-2 text-text2">
          Sign out
        </button>
      </form>
    </div>
  );
}
