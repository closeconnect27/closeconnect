import type { Metadata } from "next";
import Link from "next/link";
import {
  IconUsers,
  IconCalendarEvent,
  IconTicket,
  IconMessageCircle,
  IconStar,
  IconShieldCheck,
  IconHeartOff,
  IconSparkles,
} from "@tabler/icons-react";

export const metadata: Metadata = { title: "About" };

const FEATURES = [
  { icon: IconUsers, title: "Communities", body: "Join or start a community around anything -- running, board games, startups, poetry. Chat in circles, not just one big feed." },
  { icon: IconCalendarEvent, title: "Events", body: "Discover local events near you, free or ticketed, hosted by communities or individuals. RSVP in a tap." },
  { icon: IconTicket, title: "Ticketing", body: "Sell tickets without spreadsheets or a separate app -- payments, check-in, and registrant lists live in one place." },
  { icon: IconMessageCircle, title: "Chat & DMs", body: "Message a host directly, or catch up with your circle between meetups. No need to hand out your phone number." },
  { icon: IconStar, title: "Ratings & reviews", body: "See what a community or host is actually like before you show up, from people who already have." },
  { icon: IconShieldCheck, title: "Verification", body: "Communities can be claimed and verified by their real owner, so you know who you're actually joining." },
];

const STEPS = [
  { n: "01", title: "Find your people", body: "Search by city and interest to find communities and events already happening around you." },
  { n: "02", title: "Join or register", body: "Join a community in one tap, or register for an event -- free or paid, no separate account needed." },
  { n: "03", title: "Show up, stay connected", body: "Meet in person, then keep the conversation going in the community's chat until the next one." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-green">About CloseConnect</span>
      <h1 className="mt-2 max-w-xl font-heading text-[30px] font-black leading-[1.1] sm:text-[38px]">
        Find your people. Host what you love.
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-text2">
        CloseConnect is a hyperlocal platform for discovering communities and events near you, and for hosting your
        own. It exists because the interesting things happening in a city are usually scattered across a dozen
        WhatsApp groups, Instagram stories, and word of mouth -- easy to miss unless you already know the right
        people. CloseConnect puts them in one place, organized by city and interest, so finding your people doesn't
        depend on luck.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/communities" className="btn-primary px-6 py-3 text-[14px]">
          Browse communities
        </Link>
        <Link href="/events" className="btn-secondary px-6 py-3 text-[14px]">
          Browse events
        </Link>
      </div>

      <section className="mt-14">
        <h2 className="font-heading text-[20px] font-bold">What you can do</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-elevated flex gap-3 rounded-card bg-bg2 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-green">
                <f.icon size={18} />
              </div>
              <div>
                <p className="text-[14px] font-bold text-text">{f.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-text2">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-heading text-[20px] font-bold">How it works</h2>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="flex-1">
              <span className="font-mono text-[13px] font-bold text-green">{s.n}</span>
              <p className="mt-1 text-[14px] font-bold text-text">{s.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-text2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-heading text-[20px] font-bold">For hosts and organizers</h2>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-text2">
          Whether you run a weekly run club, a community of 500 people, or a one-off ticketed workshop, CloseConnect
          gives you a place to list it, a group chat to keep everyone in the loop, and ticketing that handles
          payment collection and payouts so you don&apos;t have to chase UPI screenshots. Communities can also be
          claimed and verified, so an established group's real owner is the one actually running it on the platform.
        </p>
      </section>

      <section className="mt-14 rounded-card border border-border bg-bg2 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-green">
            <IconHeartOff size={18} />
          </div>
          <div>
            <p className="text-[14px] font-bold text-text">Not a dating app</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text2">
              CloseConnect is built and operated in India, with pricing in Indian Rupees and a focus on real,
              in-person meetups rather than purely online communities. It&apos;s about finding people through
              shared interests, communities, and events -- not one-on-one matching.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-green">
            <IconSparkles size={18} />
          </div>
          <div>
            <p className="text-[14px] font-bold text-text">Get in touch</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text2">
              Questions, feedback, or an idea for what CloseConnect should build next? We read every message at{" "}
              <a href="mailto:closeconnect27@gmail.com" className="font-medium text-green hover:underline">
                closeconnect27@gmail.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
