"use client";

import { useState } from "react";
import { IconFlag, IconBrandWhatsapp, IconBrandInstagram } from "@tabler/icons-react";
import { safeJoinHref, isInstagramLink } from "@/lib/validators/links";
import { ReportModal } from "@/components/communities/ReportModal";

export function CommunityDetailActions({
  communityId,
  externalLink,
  isLoggedIn,
}: {
  communityId: string;
  externalLink: string | null;
  isLoggedIn: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const insta = isInstagramLink(externalLink);

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Keyed off externalLink's presence, not kind -- a community that
          went through "Go Native" keeps its original WhatsApp/Instagram
          link visible here even though kind is now 'native' (explicit
          product requirement for that switch). */}
      {externalLink && (
        <a
          href={safeJoinHref(externalLink)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-full py-3 text-[15px] font-bold transition hover:brightness-110 active:scale-[0.98]"
          style={
            insta
              ? { background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", color: "#fff" }
              : { background: "var(--green)", color: "var(--green-dark)" }
          }
        >
          {insta ? <IconBrandInstagram size={18} /> : <IconBrandWhatsapp size={18} />}
          {insta ? "View on Instagram" : "Join on WhatsApp"}
        </a>
      )}

      <button
        onClick={() => setReportOpen(true)}
        className="flex items-center justify-center gap-2 py-2 text-[12px] text-text3 transition hover:text-pink"
      >
        <IconFlag size={13} />
        Report this community
      </button>

      {reportOpen && (
        <ReportModal
          targetType="community"
          targetId={communityId}
          isLoggedIn={isLoggedIn}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
