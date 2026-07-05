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
import { CATEGORIES } from "@/lib/categories";
import { CategoryImage } from "@/components/ui/CategoryImage";

export default async function Home() {
  const supabase = await createClient();
  const stats = await getPlatformStats(supabase);

  return (
    <div className="flex-1">
      {/* HERO -- real category photography behind the headline (Meetup/
          AllEvents both lead with photography, not plain text on a flat
          background), using the same verified Unsplash set every card
          already draws from rather than any new/fabricated imagery. */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-0.5 opacity-50 sm:opacity-70">
          {CATEGORIES.slice(0, 4).map((c) => (
            <div key={c.slug} className="relative" style={{ background: c.bg }}>
              <CategoryImage slug={c.slug} seed={2} alt="" fill sizes="25vw" className="object-cover" />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/85 to-bg" />

        <div className="relative flex flex-col items-center gap-6 px-6 pb-16 pt-16 text-center sm:pt-24">
          <h1 className="font-heading text-[28px] font-extrabold leading-none min-[480px]:text-[40px] sm:text-[56px]">
            close<span className="text-green">.connect</span>
          </h1>
          <p className="max-w-md text-[16px] text-text2">Find your people. Host what you love.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/communities" className="btn-primary px-6 py-3 text-[14px]">
              Browse communities
            </Link>
            <Link href="/events" className="btn-secondary px-6 py-3 text-[14px]">
              Browse events
            </Link>
            <Link href="/search" className="btn-secondary px-6 py-3 text-[14px]">
              Search
            </Link>
          </div>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section className="border-t border-border px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-center font-heading text-[26px] font-extrabold">
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
            body="Host an event under your own profile, with or without a community attached, free or ticketed, and let people register as a guest — no account required to attend."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-border px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-center font-heading text-[26px] font-extrabold">How it works</h2>
        <div className="mx-auto flex max-w-3xl flex-col gap-8 sm:flex-row">
          <Step n={1} title="Browse or search" body="Filter by category, city, or search by name — no account needed to look around." />
          <Step n={2} title="Join or follow a link" body="Native communities: join instantly or request to join. External ones: we hand you off to their WhatsApp or Instagram." />
          <Step n={3} title="Chat, rate, host" body="Once you're in, chat in the group, rate the community, or host your own event or community when you're ready." />
        </div>
      </section>

      {/* STATS */}
      <section className="border-t border-border px-4 py-16 text-center sm:px-6">
        <h2 className="mb-8 font-heading text-[26px] font-extrabold">So far</h2>
        <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-x-12 gap-y-6">
          <Stat n={stats.communityCount} label={stats.communityCount === 1 ? "community" : "communities"} />
          <Stat n={stats.upcomingEventCount} label={stats.upcomingEventCount === 1 ? "upcoming event" : "upcoming events"} />
          <Stat n={stats.totalMembers} label={stats.totalMembers === 1 ? "member" : "members"} />
          <Stat n={stats.cityCount} label={stats.cityCount === 1 ? "city" : "cities"} />
        </div>
        <p className="mt-6 text-[13px] text-text3">
          Real numbers from what&apos;s live right now — we&apos;re early, and that&apos;s fine.
        </p>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-6 py-16 text-center">
        <h2 className="mb-2 font-heading text-[26px] font-extrabold">Ready to look around?</h2>
        <p className="mb-6 text-[14px] text-text2">No account needed to browse.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/communities" className="btn-primary px-6 py-3 text-[14px]">
            <IconUserPlus size={16} />
            Browse communities
          </Link>
          <Link href="/events" className="btn-secondary px-6 py-3 text-[14px]">
            <IconCalendarEvent size={16} />
            Browse events
          </Link>
          <Link href="/search" className="btn-secondary px-6 py-3 text-[14px]">
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
    <div className="card-elevated rounded-card bg-bg2 p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-green-tint">
        <Icon size={20} className="text-green" />
      </div>
      <h3 className="mb-2 text-[16px] font-bold text-text">{title}</h3>
      <p className="text-[13px] leading-relaxed text-text2">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex-1">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-green text-[14px] font-bold text-green-dark">
        {n}
      </div>
      <h3 className="mb-2 text-[15px] font-bold text-text">{title}</h3>
      <p className="text-[13px] leading-relaxed text-text2">{body}</p>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-heading text-[32px] font-extrabold text-green">{n}</span>
      <span className="text-[12px] font-medium text-text3">{label}</span>
    </div>
  );
}
