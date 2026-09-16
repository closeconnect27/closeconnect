"use client";

import { useState } from "react";
import { IconFlag } from "@tabler/icons-react";
import { ReportModal } from "@/components/communities/ReportModal";

// The WhatsApp/Instagram "join on..." button this used to render for an
// external listing is gone (0083) -- every community is native from
// creation now, so the real Join button above always does the job, and a
// community's WhatsApp/Instagram links live in the social-icon row instead
// (community.whatsapp_url/instagram_url) rather than this component's own
// single external_link prop.
export function CommunityDetailActions({
  communityId,
  isLoggedIn,
}: {
  communityId: string;
  isLoggedIn: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="mt-6 flex flex-col gap-4">
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
