"use client";

import { IconBrandWhatsapp, IconBrandInstagram } from "@tabler/icons-react";
import { safeSocialHref } from "@/lib/validators/links";

// CommunityCard is a Server Component (no onClick allowed on its own JSX),
// and these icons need stopPropagation() so tapping one opens WhatsApp/
// Instagram instead of also firing the card's own ClickableCard navigation
// -- same nested-interactive-descendant pattern ClickableCard's own comment
// describes (the deleted JoinBadge used to be this card's one example).
export function CardSocialLinks({
  whatsappUrl,
  instagramUrl,
}: {
  whatsappUrl: string | null;
  instagramUrl: string | null;
}) {
  if (!whatsappUrl && !instagramUrl) return null;

  return (
    <div className="flex items-center gap-2.5">
      {whatsappUrl && (
        <a
          href={safeSocialHref("whatsapp", whatsappUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          onClick={(e) => e.stopPropagation()}
          className="transition hover:brightness-110"
          style={{ color: "#25D366" }}
        >
          <IconBrandWhatsapp size={20} />
        </a>
      )}
      {instagramUrl && (
        <a
          href={safeSocialHref("instagram", instagramUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          onClick={(e) => e.stopPropagation()}
          className="transition hover:brightness-110"
          style={{ color: "#E1306C" }}
        >
          <IconBrandInstagram size={20} />
        </a>
      )}
    </div>
  );
}
