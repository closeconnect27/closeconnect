"use client";

import { useState } from "react";
import { IconFlag, IconBrandWhatsapp, IconBrandInstagram } from "@tabler/icons-react";
import { safeJoinHref, isInstagramLink } from "@/lib/validators/links";
import { ReportModal } from "@/components/communities/ReportModal";

export function CommunityDetailActions({
  communityId,
  kind,
  externalLink,
  isLoggedIn,
}: {
  communityId: string;
  kind: "native" | "external";
  externalLink: string | null;
  isLoggedIn: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const insta = isInstagramLink(externalLink);

  return (
    <div className="mt-5 flex flex-col gap-3">
      {kind === "external" && externalLink && (
        <a
          href={safeJoinHref(externalLink)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-full py-3 text-[15px] font-bold"
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
        className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-text3 hover:text-pink"
      >
        <IconFlag size={13} />
        Report this community
      </button>

      {reportOpen && (
        <ReportModal
          communityId={communityId}
          isLoggedIn={isLoggedIn}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
