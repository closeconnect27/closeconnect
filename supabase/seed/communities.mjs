// Seeds demo communities for local/dev browsing and to prove SPEC.md Section
// 6's multi-category matching against the live database, not just in theory.
// Idempotent: re-running skips communities that already exist by name.
// Run: node --env-file=.env.local supabase/seed/communities.mjs
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OWNER_EMAIL = "closeconnect27@gmail.com";

async function getOrCreateOwner() {
  const { data: users } = await admin.auth.admin.listUsers();
  const existing = users.users.find((u) => u.email === OWNER_EMAIL);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

const SEED_COMMUNITIES = [
  {
    name: "Weekend Runners BLR",
    description: "Sunday morning runs around Cubbon Park, all paces welcome.",
    category: "sports",
    extra_categories: ["wellness", "social"], // the multi-category test case
    city: "Bengaluru",
    community_type: "offline",
    kind: "native",
    join_mode: "open",
  },
  {
    name: "AI Builders BLR",
    description: "Weekly meetups for people shipping AI products in Bangalore.",
    category: "tech",
    extra_categories: [],
    city: "Bengaluru",
    community_type: "both",
    kind: "native",
    join_mode: "request",
  },
  {
    name: "BLR Book Club",
    description: "One book a month, discussed over filter coffee.",
    category: "arts",
    extra_categories: ["social"],
    city: "Bengaluru",
    community_type: "offline",
    kind: "external",
    external_link: "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr",
  },
  {
    name: "Specialty Coffee Club",
    description: "Cupping sessions and cafe crawls for coffee obsessives.",
    category: "food",
    extra_categories: [],
    city: "Mumbai",
    community_type: "offline",
    kind: "external",
    external_link: "https://instagram.com/specialtycoffeeclub",
  },
  {
    name: "Techno & House BLR",
    description: "Underground electronic music nights and record swaps.",
    category: "music",
    extra_categories: ["social"],
    city: "Bengaluru",
    community_type: "offline",
    kind: "native",
    join_mode: "open",
  },
  {
    name: "Game Dev Circle",
    description: "Show off what you're building, get feedback, find collaborators.",
    category: "gaming",
    extra_categories: ["tech"],
    city: "Bengaluru",
    community_type: "both",
    kind: "external",
    external_link: "https://chat.whatsapp.com/GameDevCircleInviteLink1",
  },
];

async function main() {
  const ownerId = await getOrCreateOwner();
  console.log("Seed owner:", ownerId);

  for (const c of SEED_COMMUNITIES) {
    const { data: existing } = await admin.from("communities").select("id").eq("name", c.name).maybeSingle();
    if (existing) {
      console.log(`skip (exists): ${c.name}`);
      continue;
    }
    const { data, error } = await admin
      .from("communities")
      .insert({ ...c, owner_id: ownerId })
      .select()
      .single();
    if (error) {
      console.error(`FAILED: ${c.name} -> ${error.message}`);
      continue;
    }
    console.log(`created: ${c.name} (${data.id}) category=${c.category} extra=${JSON.stringify(c.extra_categories)}`);
  }
}

main();
