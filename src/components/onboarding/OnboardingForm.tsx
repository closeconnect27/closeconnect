"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/actions/onboarding";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { CATEGORIES } from "@/lib/categories";

const INTEREST_OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: `${c.emoji} ${c.label}` }));

const inputClass = "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text transition placeholder:text-text3 focus:border-green";

export function OnboardingForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = onboardingSchema.safeParse({ username, dateOfBirth, interests });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      const result = await completeOnboarding({ username, dateOfBirth, interests, redirectTo });
      // On success completeOnboarding redirects server-side and never
      // returns -- an object back here only ever means an error.
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-text2">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="yourname"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-z0-9_]+"
          className={inputClass}
        />
        <p className="mt-1 text-[11px] text-text3">3-20 characters: lowercase letters, numbers, and underscores.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-text2">Date of birth</label>
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          required
          max={new Date().toISOString().slice(0, 10)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-text2">Interests (up to 10)</label>
        <MultiCombobox values={interests} onChange={setInterests} options={INTEREST_OPTIONS} placeholder="Choose interests" />
      </div>

      {error && <p className="text-[13px] text-pink">{error}</p>}

      <button type="submit" disabled={pending} className="btn-primary mt-2 w-full py-3 text-[14px]">
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
