import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <p className="text-zinc-500 dark:text-zinc-400">{user.email}</p>
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        display_name: {profile?.display_name ?? "(no profile row found)"}
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
