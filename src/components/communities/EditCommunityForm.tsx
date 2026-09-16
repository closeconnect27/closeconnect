"use client";

import { useState, useTransition } from "react";
import type { CategorySlug } from "@/lib/categories";
import { updateCommunitySchema } from "@/lib/validation/community";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import { updateCommunity } from "@/app/actions/communities";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { CityMultiSelect } from "@/components/ui/CityMultiSelect";
import { CategoryMultiSelect } from "@/components/ui/CategoryMultiSelect";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import type { Community } from "@/lib/queries/communities";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

// Editable: name, description (rich, with up to 5 inline images -- the
// old separate gallery feature was removed in favor of this), category,
// extra_categories, city. Logo/cover uploads were removed too, the app
// always shows a category Unsplash placeholder instead now.
// Deliberately not here: owner_id, claim_status, join_mode (changing
// join_mode once members exist under the old mode is a real product risk,
// not an oversight -- flagged separately, not just left off silently).
// Both the Server Action and RLS (0017) enforce this independently of
// what this form does or doesn't show.
export function EditCommunityForm({ community }: { community: Community }) {
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState({
    json: community.description_content,
    text: community.description,
  });
  const [categories, setCategories] = useState<CategorySlug[]>(
    [community.category, ...(community.extra_categories ?? [])].filter((c): c is CategorySlug => !!c),
  );
  const [cities, setCities] = useState<string[]>(
    community.all_cities ? [] : [community.city, ...(community.extra_cities ?? [])].filter((c): c is string => !!c),
  );
  const [allCities, setAllCities] = useState(community.all_cities);
  const [memberLimit, setMemberLimit] = useState(community.member_limit != null ? String(community.member_limit) : "");
  const [instagramUrl, setInstagramUrl] = useState(community.instagram_url ?? "");
  const [facebookUrl, setFacebookUrl] = useState(community.facebook_url ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(community.linkedin_url ?? "");
  const [whatsappUrl, setWhatsappUrl] = useState(community.whatsapp_url ?? "");
  const [phone, setPhone] = useState(community.phone ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      name,
      description: description.text,
      description_content: description.json,
      category: categories[0] || "",
      extra_categories: categories.slice(1),
      city: allCities ? undefined : cities[0] || undefined,
      extra_cities: allCities ? [] : cities.slice(1),
      all_cities: allCities,
      member_limit: memberLimit ? Number(memberLimit) : undefined,
      instagram_url: instagramUrl || undefined,
      facebook_url: facebookUrl || undefined,
      linkedin_url: linkedinUrl || undefined,
      whatsapp_url: whatsappUrl || undefined,
      phone: phone || undefined,
    };

    const parsed = updateCommunitySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      // description_content crosses the Server Action boundary as a JSON
      // string, not the raw object -- see serializeDescriptionContent's
      // comment for why.
      const result = await updateCommunity(community.id, {
        ...parsed.data,
        description_content: serializeDescriptionContent(parsed.data.description_content as object | null),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {community.is_verified && (
        <div className="flex items-center gap-3 rounded-card border border-border2 p-4">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
            Verification
            <VerifiedBadge />
          </span>
          <p className="text-[12px] text-text3">This community is verified.</p>
        </div>
      )}

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

        <Field label="Categories (up to 5)">
          <CategoryMultiSelect values={categories} onChange={setCategories} />
        </Field>

        <Field label="Cities (optional)">
          <CityMultiSelect cities={cities} allCities={allCities} onChange={(c, a) => { setCities(c); setAllCities(a); }} />
        </Field>

        {/* Native only -- external communities never populate
            community_members (no join mechanic, they just link out), so
            the limit trigger (0057) can never actually enforce this for
            one -- setting it would be a silently inert field. */}
        {community.kind === "native" && (
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
        )}

        <Field label="WhatsApp group or channel (optional)">
          <input
            value={whatsappUrl}
            onChange={(e) => setWhatsappUrl(e.target.value)}
            placeholder="https://chat.whatsapp.com/…"
            className={inputClass}
          />
        </Field>

        <Field label="Instagram (optional)">
          <input
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/…"
            className={inputClass}
          />
        </Field>

        <Field label="Facebook (optional)">
          <input
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.target.value)}
            placeholder="https://facebook.com/…"
            className={inputClass}
          />
        </Field>

        <Field label="LinkedIn (optional)">
          <input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/…"
            className={inputClass}
          />
        </Field>

        <Field label="Phone number (optional)">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" className={inputClass} />
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
      <span className="text-[12px] font-bold text-text2">{label}</span>
      {children}
    </div>
  );
}
