"use client";

import { SingleImageUploader } from "@/components/ui/SingleImageUploader";
import { setCommunityImage, removeCommunityImage } from "@/app/actions/communities";

export function CommunityImageUploader({
  communityId,
  kind,
  currentUrl,
  shape,
  label,
}: {
  communityId: string;
  kind: "logo" | "cover";
  currentUrl: string | null;
  shape: "square" | "wide";
  label: string;
}) {
  return (
    <SingleImageUploader
      bucket="community-images"
      pathPrefix={`${communityId}/${kind}`}
      currentUrl={currentUrl}
      shape={shape}
      label={label}
      onUpload={(url) => setCommunityImage(communityId, kind, url)}
      onRemove={(path) => removeCommunityImage(communityId, kind, path)}
    />
  );
}
