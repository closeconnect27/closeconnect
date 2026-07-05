"use client";

import { useState } from "react";
import { IconFlag } from "@tabler/icons-react";
import { ReportModal } from "@/components/communities/ReportModal";

export function EventDetailActions({ eventId, isLoggedIn }: { eventId: string; isLoggedIn: boolean }) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setReportOpen(true)}
        className="flex items-center justify-center gap-2 py-2 text-[12px] text-text3 transition hover:text-pink"
      >
        <IconFlag size={13} />
        Report this event
      </button>

      {reportOpen && (
        <ReportModal
          targetType="event"
          targetId={eventId}
          isLoggedIn={isLoggedIn}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
