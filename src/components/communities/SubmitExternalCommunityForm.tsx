"use client";

import { useState, useTransition } from "react";
import type { CategorySlug } from "@/lib/categories";
import { submitExternalCommunitySchema } from "@/lib/validation/community";
import { submitExternalCommunity } from "@/app/actions/communities";
import { CityMultiSelect } from "@/components/ui/CityMultiSelect";
import { CategoryMultiSelect } from "@/components/ui/CategoryMultiSelect";
import { track } from "@/lib/mixpanel/client";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

// No login required -- this is the public "add a community you know about"
// path, distinct from /communities/new (which creates a native community
// you own). Submissions land unowned and unclaimed (still native, 0083);
// the actual owner claims it later via the community detail page.
export function SubmitExternalCommunityForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<CategorySlug[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [allCities, setAllCities] = useState(false);
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
      name,
      description,
      category: categories[0] || "",
      extra_categories: categories.slice(1),
      city: allCities ? undefined : cities[0] || undefined,
      extra_cities: allCities ? [] : cities.slice(1),
      all_cities: allCities,
      instagram_url: instagramUrl || undefined,
      facebook_url: facebookUrl || undefined,
      linkedin_url: linkedinUrl || undefined,
      whatsapp_url: whatsappUrl || undefined,
      phone: phone || undefined,
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
    track("community_submitted", { category: categories[0] || "none", city: allCities ? "all" : cities[0] || "none" });

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

      <Field label="Categories (up to 5)">
        <CategoryMultiSelect values={categories} onChange={setCategories} />
      </Field>

      <Field label="Cities (optional)">
        <CityMultiSelect cities={cities} allCities={allCities} onChange={(c, a) => { setCities(c); setAllCities(a); }} />
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
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" className={inputClass} />
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
      <span className="text-[12px] font-bold text-text2">{label}</span>
      {children}
    </div>
  );
}
