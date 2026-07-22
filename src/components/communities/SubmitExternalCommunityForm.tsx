"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { submitExternalCommunitySchema } from "@/lib/validation/community";
import { submitExternalCommunity } from "@/app/actions/communities";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { CITY_OPTIONS } from "@/lib/cities";
import { track } from "@/lib/mixpanel/client";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

// No login required -- this is the public "add a community you know about"
// path, distinct from /communities/new (which creates a native community
// you own). Submissions land unowned and unclaimed; the actual owner claims
// it later via the community detail page.
export function SubmitExternalCommunityForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategorySlug>(CATEGORIES[0].slug);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [externalLink, setExternalLink] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      name,
      description,
      category,
      extra_categories: extraCategories,
      city: city || undefined,
      extra_cities: extraCities,
      external_link: externalLink,
    };

    const parsed = submitExternalCommunitySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    // Tracked here, not after the call -- a successful submission
    // redirect()s server-side and this component never gets control back
    // to run a "success" branch. Errors returning { error } are the only
    // case that resumes here, matching the old site's own fire-on-submit
    // (not fire-on-confirmed-success) semantics for this event.
    track("community_submitted", { category, city: city || "none" });

    startTransition(async () => {
      const result = await submitExternalCommunity(parsed.data);
      if (result?.error) setError(result.error);
    });
  }

  return (
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

      <Field label="WhatsApp or Instagram link">
        <input
          value={externalLink}
          onChange={(e) => setExternalLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          required
          className={inputClass}
        />
      </Field>

      <Field label="Category">
        <CategoryPicker value={category} onChange={setCategory} />
      </Field>

      <Field label="Also show up under (optional, up to 4)">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => c.slug !== category).map((c) => (
            <button
              type="button"
              key={c.slug}
              onClick={() =>
                setExtraCategories((prev) =>
                  prev.includes(c.slug) ? prev.filter((s) => s !== c.slug) : [...prev, c.slug],
                )
              }
              className={
                extraCategories.includes(c.slug)
                  ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium capitalize text-green-dark transition"
                  : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium capitalize text-text2 transition hover:border-green hover:text-green"
              }
            >
              {c.slug}
            </button>
          ))}
        </div>
      </Field>

      <Field label="City (optional)">
        <Combobox value={city} onChange={setCity} options={CITY_OPTIONS} placeholder="Any city" />
      </Field>

      <Field label="Also show up under (optional, up to 5 more cities)">
        <MultiCombobox
          values={extraCities}
          onChange={setExtraCities}
          options={CITY_OPTIONS.filter((o) => o.value !== city)}
          placeholder="Add more cities"
        />
      </Field>

      {error && <p className="text-[13px] text-pink">{error}</p>}

      <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
        {pending ? "Submitting…" : "Submit listing"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-text3">{label}</span>
      {children}
    </div>
  );
}
