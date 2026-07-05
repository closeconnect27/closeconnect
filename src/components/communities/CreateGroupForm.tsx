"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { createGroup } from "@/app/actions/membership";

export function CreateGroupForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createGroup(communityId, { name, description: description || undefined });
      if (result?.error) {
        setError(result.error);
      } else {
        setName("");
        setDescription("");
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
      >
        <IconPlus size={14} />
        Add a group
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-elevated flex flex-col gap-3 rounded-card bg-bg2 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name, e.g. Weekend Runs"
        required
        className="rounded-card-sm border border-border2 bg-bg3 px-4 py-2.5 text-[14px] transition focus:border-green"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="rounded-card-sm border border-border2 bg-bg3 px-4 py-2.5 text-[14px] transition focus:border-green"
      />
      {error && <p className="text-[12px] text-pink">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary flex-1 py-2.5 text-[13px]">
          {pending ? "Creating…" : "Create group"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-2.5 text-[13px]">
          Cancel
        </button>
      </div>
    </form>
  );
}
