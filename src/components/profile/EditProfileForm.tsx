"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { updateProfile } from "@/app/actions/profile";
import { updateProfileSchema } from "@/lib/validation/profile";
import type { ProfileDetails, PublicProfileBasic } from "@/lib/queries/profileDetails";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

const VISIBILITY_OPTIONS = [
  { value: "public" as const, label: "Public", hint: "Anyone can view your full profile." },
  { value: "members_only" as const, label: "Members only", hint: "Only people signed in can view it." },
  {
    value: "private" as const,
    label: "Private",
    hint: "People must send a follow request, which you approve, before they can view it.",
  },
];

// bio/profile_visibility come from `basic` (profiles, always public) --
// the rest from `details` (profile_details, gated). Both land in the same
// form since a viewer editing their own profile doesn't need to think
// about that split; updateProfile writes each field back to the table it
// actually lives on.
export function EditProfileForm({ basic, details }: { basic: PublicProfileBasic; details: ProfileDetails }) {
  const router = useRouter();
  const [bio, setBio] = useState(basic.bio ?? "");
  const [occupation, setOccupation] = useState(details.occupation ?? "");
  const [company, setCompany] = useState(details.company ?? "");
  const [college, setCollege] = useState(details.college ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(details.linkedin_url ?? "");
  const [githubUrl, setGithubUrl] = useState(details.github_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(details.instagram_url ?? "");
  const [skills, setSkills] = useState<string[]>(details.skills);
  const [skillDraft, setSkillDraft] = useState("");
  const [visibility, setVisibility] = useState(basic.profile_visibility);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function addSkill() {
    const skill = skillDraft.trim();
    if (!skill || skills.includes(skill) || skills.length >= 15) {
      setSkillDraft("");
      return;
    }
    setSkills([...skills, skill]);
    setSkillDraft("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      bio: bio || undefined,
      occupation: occupation || undefined,
      company: company || undefined,
      college: college || undefined,
      linkedin_url: linkedinUrl || undefined,
      github_url: githubUrl || undefined,
      instagram_url: instagramUrl || undefined,
      skills,
      profile_visibility: visibility,
    };

    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      const result = await updateProfile(parsed.data);
      if (result?.error) setError(result.error);
      else router.push(`/profile/${details.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Field label="Bio">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={1000} className={inputClass} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Occupation">
          <input value={occupation} onChange={(e) => setOccupation(e.target.value)} maxLength={100} className={inputClass} />
        </Field>
        <Field label="Company">
          <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={100} className={inputClass} />
        </Field>
        <Field label="College">
          <input value={college} onChange={(e) => setCollege(e.target.value)} maxLength={100} className={inputClass} />
        </Field>
      </div>

      <Field label="Skills (up to 15)">
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="flex items-center gap-1.5 rounded-full border border-border2 px-3 py-1.5 text-[12px] font-medium text-text2"
            >
              {skill}
              <button
                type="button"
                onClick={() => setSkills(skills.filter((s) => s !== skill))}
                aria-label={`Remove ${skill}`}
                className="text-text3 transition hover:text-pink"
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
        </div>
        {skills.length < 15 && (
          <input
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            onBlur={addSkill}
            placeholder="Type a skill and press Enter"
            className={`mt-2 ${inputClass}`}
          />
        )}
      </Field>

      <Field label="LinkedIn (optional)">
        <input
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://linkedin.com/in/..."
          className={inputClass}
        />
      </Field>
      <Field label="GitHub (optional)">
        <input
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          placeholder="https://github.com/..."
          className={inputClass}
        />
      </Field>
      <Field label="Instagram (optional)">
        <input
          value={instagramUrl}
          onChange={(e) => setInstagramUrl(e.target.value)}
          placeholder="https://instagram.com/..."
          className={inputClass}
        />
      </Field>

      <Field label="Who can see your full profile">
        <div className="flex flex-col gap-3">
          {VISIBILITY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-3 text-[13px]">
              <input
                type="radio"
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
                className="mt-0.5 accent-green"
              />
              <span>
                <span className="font-medium text-text">{opt.label}</span>
                <span className="block text-text3">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      {error && <p className="text-[13px] text-pink">{error}</p>}

      <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
        {pending ? "Saving…" : "Save profile"}
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
