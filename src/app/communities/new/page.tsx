"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { createCommunitySchema } from "@/lib/validation/community";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { createCommunity } from "@/app/actions/communities";

const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune"];
const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

export default function NewCommunityPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategorySlug>(CATEGORIES[0].slug);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [communityType, setCommunityType] = useState<"online" | "offline" | "both">("both");
  const [joinMode, setJoinMode] = useState<"open" | "request">("open");
  const [joinFormFields, setJoinFormFields] = useState<FormFieldDraft[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggleExtraCategory(slug: string) {
    setExtraCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      name,
      description,
      category,
      extra_categories: extraCategories,
      city: city || undefined,
      community_type: communityType,
      join_mode: joinMode,
      join_form_fields: joinMode === "request" ? joinFormFields : [],
    };

    const parsed = createCommunitySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      const result = await createCommunity(parsed.data);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-[28px] font-extrabold leading-tight">Create a community</h1>
        <p className="mb-8 text-[14px] text-text3">
          One umbrella community, sub-groups auto-created — General plus Announcements.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              className={inputClass}
            />
          </Field>

          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategorySlug)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Also show up under (optional, up to 4)">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.slug !== category).map((c) => (
                <button
                  type="button"
                  key={c.slug}
                  onClick={() => toggleExtraCategory(c.slug)}
                  className={
                    extraCategories.includes(c.slug)
                      ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
                      : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
                  }
                >
                  {c.slug}
                </button>
              ))}
            </div>
          </Field>

          <Field label="City (optional)">
            <input value={city} onChange={(e) => setCity(e.target.value)} list="cities" className={inputClass} />
            <datalist id="cities">
              {CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Type">
            <div className="flex gap-2">
              {(["online", "offline", "both"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setCommunityType(t)}
                  className={
                    communityType === t
                      ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
                      : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Who can join">
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 text-[13px]">
                <input
                  type="radio"
                  checked={joinMode === "open"}
                  onChange={() => setJoinMode("open")}
                  className="mt-0.5 accent-green"
                />
                <span>
                  <span className="font-medium text-text">Open</span>
                  <span className="block text-text3">Anyone can join instantly.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-[13px]">
                <input
                  type="radio"
                  checked={joinMode === "request"}
                  onChange={() => setJoinMode("request")}
                  className="mt-0.5 accent-green"
                />
                <span>
                  <span className="font-medium text-text">Request to join</span>
                  <span className="block text-text3">
                    You approve each request — optionally ask questions first.
                  </span>
                </span>
              </label>
            </div>
          </Field>

          {joinMode === "request" && (
            <Field label="Join-request questions (optional)">
              <FormBuilder fields={joinFormFields} onChange={setJoinFormFields} />
            </Field>
          )}

          {error && <p className="text-[13px] text-pink">{error}</p>}

          <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
            {pending ? "Creating…" : "Create community"}
          </button>
        </form>
      </div>
    </div>
  );
}

// A plain div, not <label> -- several fields (category toggles, the
// join-mode radios) contain more than one focusable control, and a <label>
// wrapping multiple controls gives browsers ambiguous click-to-activate
// behavior (which one gets the synthetic click?), the same class of bug as
// nesting interactive elements inside an anchor.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-text3">{label}</span>
      {children}
    </div>
  );
}
