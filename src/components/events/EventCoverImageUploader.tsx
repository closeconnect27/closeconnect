"use client";

import { SingleImageUploader } from "@/components/ui/SingleImageUploader";
import { setEventCoverImage, removeEventCoverImage } from "@/app/actions/events";

// Distinct from EventImageUploader (the up-to-3-photo gallery table) --
// this is the single cover_image_url column, same event-images bucket.
export function EventCoverImageUploader({ eventId, currentUrl }: { eventId: string; currentUrl: string | null }) {
  return (
    <SingleImageUploader
      bucket="event-images"
      pathPrefix={`${eventId}/cover`}
      currentUrl={currentUrl}
      shape="wide"
      label="Cover image"
      onUpload={(url) => setEventCoverImage(eventId, url)}
      onRemove={(path) => removeEventCoverImage(eventId, path)}
    />
  );
}
