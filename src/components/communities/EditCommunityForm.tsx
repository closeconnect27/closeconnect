"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { updateCommunitySchema } from "@/lib/validation/community";
import { updateCommunity } from "@/app/actions/communities";
import { RequestVerificationButton } from "@/components/verification/RequestVerificationButton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { CITY_OPTIONS } from "@/lib/cities";
import type { Community } from "@/lib/queries/communities";
import type { VerificationRequestStatus } from "@/lib/queries/verification";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

// Editable: name, description (rich, with up to 5 inline images -- the
// old separate gallery feature was removed in favor of this), category,
// extra_categories, city. Logo/cover uploads were removed too, the app
// always shows a category Unsplash placeholder instead now.
// Deliberately not here: owner_id, claim_status, join_mode (changing
// join_mode once members exist under the old mode is a real product risk,
// not an oversight -- flagged separately, not just left off silently) and
// community_type (not named in the editable-fields list this was scoped
// against). Both the Server Action and RLS (0017) enforce this
// independently of what this form does or doesn't show.
export function EditCommunityForm({
  community,
  verificationStatus,
}: {
  community: Community;
  verificationStatus: VerificationRequestStatus;
}) {
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState({
    json: community.description_content,
    text: community.description,
  });
  const [category, setCategory] = useState<CategorySlug>(community.category as CategorySlug);
  const [extraCategories, setExtraCategories] = useState<string[]>(community.extra_categories ?? []);
  const [city, setCity] = useState(community.city ?? "");
  const [extraCities, setExtraCities] = useState<string[]>(community.extra_cities ?? []);
  const [memberLimit, setMemberLimit] = useState(community.member_limit != null ? String(community.member_limit) : "");
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
      description: description.text,
      description_content: description.json,
      category,
      extra_categories: extraCategories,
      city: city || undefined,
      extra_cities: extraCities,
      member_limit: memberLimit ? Number(memberLimit) : undefined,
    };

    const parsed = updateCommunitySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      const result = await updateCommunity(community.id, parsed.data);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-card border border-border2 p-4">
        <div>
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
            Verification
            {community.is_verified && <VerifiedBadge />}
          </span>
          <p className="mt-1 text-[12px] text-text3">
            {community.is_verified
              ? "This community is verified."
              : "A verified badge shows this community has been reviewed by an admin."}
          </p>
        </div>
        <RequestVerificationButton
          targetId={community.id}
          isVerified={community.is_verified}
          initialStatus={verificationStatus}
        />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </Field>

        <Field label="Description">
          <RichTextEditor
            content={description.json}
            onChange={setDescription}
            placeholder="What's this community about?"
            imageUpload={{ bucket: "community-images", entityId: community.id }}
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
                onClick={() => toggleExtraCategory(c.slug)}
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

        <Field label="Limit members (optional)">
          <input
            type="number"
            min={1}
            value={memberLimit}
            onChange={(e) => setMemberLimit(e.target.value)}
            placeholder="No limit"
            className={inputClass}
          />
          <p className="text-[11px] text-text3">Once this many people have joined, new joins are blocked until someone leaves.</p>
        </Field>

        {error && <p className="text-[13px] text-pink">{error}</p>}

        <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
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
