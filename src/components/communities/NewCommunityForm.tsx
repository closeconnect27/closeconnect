"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategorySlug } from "@/lib/categories";
import { createCommunitySchema } from "@/lib/validation/community";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { createCommunity } from "@/app/actions/communities";
import { CityMultiSelect } from "@/components/ui/CityMultiSelect";
import { CategoryMultiSelect } from "@/components/ui/CategoryMultiSelect";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

export function NewCommunityForm() {
  const router = useRouter();
  // Generated once, up front, not at submit time -- the rich editor needs
  // a stable id to upload inline images against before this community
  // exists (0053's storage policy allows that for a not-yet-claimed id).
  // useState(() => ...), not a bare crypto.randomUUID() call, so it's
  // computed once on mount and stays stable across re-renders.
  const [communityId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [description, setDescription] = useState({ json: null as object | null, text: "" });
  const [categories, setCategories] = useState<CategorySlug[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [allCities, setAllCities] = useState(false);
  const [joinMode, setJoinMode] = useState<"open" | "request">("open");
  const [joinFormFields, setJoinFormFields] = useState<FormFieldDraft[]>([]);
  const [memberLimit, setMemberLimit] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      id: communityId,
      name,
      description: description.text,
      description_content: description.json,
      category: categories[0] || "",
      extra_categories: categories.slice(1),
      city: allCities ? undefined : cities[0] || undefined,
      extra_cities: allCities ? [] : cities.slice(1),
      all_cities: allCities,
      join_mode: joinMode,
      join_form_fields: joinMode === "request" ? joinFormFields : [],
      member_limit: memberLimit ? Number(memberLimit) : undefined,
      instagram_url: instagramUrl || undefined,
      facebook_url: facebookUrl || undefined,
      linkedin_url: linkedinUrl || undefined,
      whatsapp_url: whatsappUrl || undefined,
      phone: phone || undefined,
    };

    const parsed = createCommunitySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      // description_content crosses the Server Action boundary as a JSON
      // string, not the raw object -- see serializeDescriptionContent's
      // comment for why.
      const result = await createCommunity({
        ...parsed.data,
        description_content: serializeDescriptionContent(parsed.data.description_content as object | null),
      });
      if (result?.error || !result?.communityId) {
        setError(result?.error ?? "Could not create community");
        return;
      }
      router.push(`/communities/${result.communitySlug || result.communityId}`);
    });
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-[18px] font-bold leading-tight">Create a community</h1>
        <p className="mb-8 text-[14px] text-text3">
          One umbrella community, sub-circles auto-created — Common Room plus Broadcast.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </Field>

          <Field label="Description">
            <RichTextEditor
              content={description.json}
              onChange={setDescription}
              placeholder="What's this community about?"
              imageUpload={{ bucket: "community-images", entityId: communityId }}
            />
          </Field>

          <Field label="Categories (up to 5)">
            <CategoryMultiSelect values={categories} onChange={setCategories} />
          </Field>

          <Field label="Cities (optional)">
            <CityMultiSelect cities={cities} allCities={allCities} onChange={(c, a) => { setCities(c); setAllCities(a); }} />
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
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 …"
              className={inputClass}
            />
          </Field>

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
      <span className="text-[12px] font-bold text-text2">{label}</span>
      {children}
    </div>
  );
}
