import Link from "next/link";
import {
  IconUsers,
  IconMessageCircle2,
  IconCalendarEvent,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getPlatformStats } from "@/lib/queries/stats";

export default async function Home() {
  const supabase = await createClient();
  const stats = await getPlatformStats(supabase);

  return (
    <div className="flex-1">
      {/* HERO */}
      <section className="flex flex-col items-center gap-4 px-6 pb-14 pt-16 text-center sm:pt-24">
        <h1 className="font-heading text-[32px] font-extrabold sm:text-[44px]">
          close<span className="text-green">.connect</span>
        </h1>
        <p className="max-w-md text-[15px] text-text2">Find your people. Host what you love.</p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/communities"
            className="rounded-full bg-green px-5 py-2.5 text-[14px] font-bold text-green-dark hover:bg-green-mid"
          >
            Browse communities
          </Link>
          <Link
            href="/search"
            className="rounded-full border border-border2 px-5 py-2.5 text-[14px] font-bold text-text2 hover:text-text"
          >
            Search
          </Link>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section className="border-t border-border px-4 py-14 sm:px-5">
        <h2 className="mb-8 text-center font-heading text-[22px] font-extrabold">
          What Close.Connect actually is
        </h2>
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={IconUsers}
            title="Community discovery"
            body="Browse communities by category and city — some run natively on Close.Connect, others link out to an existing WhatsApp group or Instagram page. One directory, either kind."
          />
          <FeatureCard
            icon={IconMessageCircle2}
            title="Native communities"
            body="One umbrella community, many topic groups — like WhatsApp Communities. Open join or request-to-join, your choice as the owner. Each group has its own chat."
          />
          <FeatureCard
            icon={IconCalendarEvent}
            title="Events"
            body="Coming soon: host an event under your own profile, with or without a community attached, and let people register as a guest — no account required to attend."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-border px-4 py-14 sm:px-5">
        <h2 className="mb-8 text-center font-heading text-[22px] font-extrabold">How it works</h2>
        <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:flex-row sm:gap-4">
          <Step n={1} title="Browse or search" body="Filter by category, city, or search by name — no account needed to look around." />
          <Step n={2} title="Join or follow a link" body="Native communities: join instantly or request to join. External ones: we hand you off to their WhatsApp or Instagram." />
          <Step n={3} title="Chat, rate, host" body="Once you're in, chat in the group, rate the community, or host your own event or community when you're ready." />
        </div>
      </section>

      {/* STATS */}
      <section className="border-t border-border px-4 py-14 text-center sm:px-5">
        <h2 className="mb-8 font-heading text-[22px] font-extrabold">So far</h2>
        <div className="mx-auto flex max-w-2xl justify-center gap-10">
          <Stat n={stats.communityCount} label={stats.communityCount === 1 ? "community" : "communities"} />
          <Stat n={stats.totalMembers} label={stats.totalMembers === 1 ? "member" : "members"} />
          <Stat n={stats.cityCount} label={stats.cityCount === 1 ? "city" : "cities"} />
        </div>
        <p className="mt-6 text-[12px] text-text3">
          Real numbers from what&apos;s live right now — we&apos;re early, and that&apos;s fine.
        </p>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-6 py-14 text-center">
        <h2 className="mb-2 font-heading text-[22px] font-extrabold">Ready to look around?</h2>
        <p className="mb-6 text-[14px] text-text2">No account needed to browse.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/communities"
            className="flex items-center gap-2 rounded-full bg-green px-5 py-2.5 text-[14px] font-bold text-green-dark hover:bg-green-mid"
          >
            <IconUserPlus size={16} />
            Browse communities
          </Link>
          <Link
            href="/search"
            className="flex items-center gap-2 rounded-full border border-border2 px-5 py-2.5 text-[14px] font-bold text-text2 hover:text-text"
          >
            <IconSearch size={16} />
            Search
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof IconUsers;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-card border border-border bg-bg2 p-5">
      <Icon size={22} className="mb-3 text-green" />
      <h3 className="mb-1.5 text-[15px] font-bold text-text">{title}</h3>
      <p className="text-[13px] leading-relaxed text-text2">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex-1">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-green text-[13px] font-bold text-green-dark">
        {n}
      </div>
      <h3 className="mb-1 text-[14px] font-bold text-text">{title}</h3>
      <p className="text-[13px] leading-relaxed text-text2">{body}</p>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-heading text-[28px] font-extrabold text-green">{n}</span>
      <span className="text-[11px] font-medium text-text3">{label}</span>
    </div>
  );
}
