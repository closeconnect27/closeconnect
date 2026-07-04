"use client";

import { IconBrandWhatsapp, IconBrandInstagram } from "@tabler/icons-react";
import { safeJoinHref, isInstagramLink } from "@/lib/validators/links";

// Its own client component because it needs stopPropagation to keep this
// nested link from also triggering the parent ClickableCard's navigation --
// can't pass an event handler from the server-rendered card. A real <a>
// nested in ClickableCard's div wrapper is valid HTML (unlike nesting it in
// a <Link>/<a>), which is exactly why CommunityCard uses ClickableCard.
export function JoinBadge({ link }: { link: string }) {
  const insta = isInstagramLink(link);
  return (
    <a
      href={safeJoinHref(link)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-bold"
      style={
        insta
          ? { background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", borderColor: "transparent", color: "#fff" }
          : { borderColor: "var(--green)", color: "var(--green)" }
      }
    >
      {insta ? <IconBrandInstagram size={11} /> : <IconBrandWhatsapp size={11} />}
      {insta ? "View" : "Join"}
    </a>
  );
}
