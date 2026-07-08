"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { updateCommunitySchema } from "@/lib/validation/community";
import { updateCommunity } from "@/app/actions/communities";
import { CommunityImageUploader } from "@/components/communities/CommunityImageUploader";
import { CommunityImageGalleryUploader } from "@/components/communities/CommunityImageGalleryUploader";
import { RequestVerificationButton } from "@/components/verification/RequestVerificationButton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { CITY_OPTIONS } from "@/lib/cities";
import type { Community, CommunityImage } from "@/lib/queries/communities";
import type { VerificationRequestStatus } from "@/lib/queries/verification";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

// Editable: name, description, logo, cover, category, extra_categories,
// city. Deliberately not here: owner_id, claim_status, join_mode (changing
// join_mode once members exist under the old mode is a real product risk,
// not an oversight -- flagged separately, not just left off silently) and
// community_type (not named in the editable-fields list this was scoped
// against). Both the Server Action and RLS (0017) enforce this
// independently of what this form does or doesn't show.
export function EditCommunityForm({
  community,
  images,
  verificationStatus,
}: {
  community: Community;
  images: CommunityImage[];
  verificationStatus: VerificationRequestStatus;
}) {
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [category, setCategory] = useState<CategorySlug>(community.category as CategorySlug);
  const [extraCategories, setExtraCategories] = useState<string[]>(community.extra_categories ?? []);
  const [city, setCity] = useState(community.city ?? "");
  const [extraCities, setExtraCities] = useState<string[]>(community.extra_cities ?? []);
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
      extra_cities: extraCities,
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
          targetType="community"
          targetId={community.id}
          isVerified={community.is_verified}
          initialStatus={verificationStatus}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <CommunityImageUploader
          communityId={community.id}
          kind="logo"
          currentUrl={community.logo_url}
          shape="square"
          label="Logo"
        />
        <CommunityImageUploader
          communityId={community.id}
          kind="cover"
          currentUrl={community.cover_image_url}
          shape="wide"
          label="Cover image"
        />
      </div>

      <div>
        <span className="mb-2 block text-[12px] font-bold text-text3">Gallery</span>
        <CommunityImageGalleryUploader communityId={community.id} images={images} />
      </div>

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
