"use client";

import Link from "next/link";

// Its own client component for the same reason JoinBadge is (see its
// comment) -- EventCard is a Server Component, and a Server Component
// can't pass an event handler (a plain function) as a prop to a Client
// Component like next/link's <Link>. Defining the handler inside a
// client component's own module, instead of inlining it in EventCard's
// JSX, is what actually avoids that boundary violation ("Event handlers
// cannot be passed to Client Component props") -- this exact bug shipped
// to production once already by getting that distinction wrong.
export function EventHostLink({ hostId, name }: { hostId: string; name: string }) {
  return (
    <Link
      href={`/profile/${hostId}`}
      onClick={(e) => e.stopPropagation()}
      className="hover:text-green hover:underline"
    >
      {name}
    </Link>
  );
}
