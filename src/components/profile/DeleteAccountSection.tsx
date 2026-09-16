"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMyAccount } from "@/app/actions/account";
import { createClient } from "@/lib/supabase/client";

export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setPending(true);
    setError("");
    const { error } = await deleteMyAccount();
    if (error) {
      setPending(false);
      setError(error);
      return;
    }
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-10 rounded-card border border-pink/40 bg-pink-tint p-4">
      <h2 className="font-heading text-[15px] font-semibold text-pink">Delete account</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-text2">
        Permanently deletes your profile, personal details, and login access. This can&apos;t be undone. See what&apos;s
        deleted vs. retained on the{" "}
        <a href="/account-deletion" target="_blank" rel="noopener noreferrer" className="underline">
          account deletion
        </a>{" "}
        page.
      </p>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[13px] font-medium text-pink underline">
          Delete my account
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-[12px] text-text2" htmlFor="delete-confirm">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="rounded-card-sm border border-border2 bg-bg3 px-3 py-2 text-[14px]"
            placeholder="DELETE"
          />
          {error ? <p className="text-[12px] text-pink">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={confirmText !== "DELETE" || pending}
              onClick={handleDelete}
              className="rounded-full bg-pink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {pending ? "Deleting..." : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError("");
              }}
              className="rounded-full border border-border px-4 py-2 text-[13px] text-text2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
