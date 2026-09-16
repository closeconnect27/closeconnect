"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconPlus, IconVideo, IconLoader2 } from "@tabler/icons-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import { createPost, createPoll, createVideoPost } from "@/app/actions/feed";
import { createClient } from "@/lib/supabase/client";
import type { PostableCommunity } from "@/lib/queries/feed";

type PastEvent = { id: string; event_name: string };
const MAX_POLL_OPTIONS = 6;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mirrors mobile's feed/new.tsx: pick which (owned/moderated) community to
 * post as, choose Post or Poll, optionally link a past event as a recap,
 * submit. Auto-selects the only option when there's exactly one, same as
 * mobile. */
export function NewPostForm({ communities }: { communities: PostableCommunity[] }) {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(communities.length === 1 ? communities[0].id : null);
  const [content, setContent] = useState<{ json: object | null; text: string }>({ json: null, text: "" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [postType, setPostType] = useState<"post" | "poll" | "video">("post");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Short video posts (0131): a single video, not routed through the rich
  // editor -- a plain caption + one video file, its own mutually-exclusive
  // post shape alongside plain/poll, mirroring mobile's feed/new.tsx.
  const [videoCaption, setVideoCaption] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [pastEvents, setPastEvents] = useState<PastEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!communityId) {
        if (!cancelled) setPastEvents([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, event_name, event_date")
        .eq("community_id", communityId)
        .eq("status", "active")
        .not("event_date", "is", null)
        .lt("event_date", todayIso())
        .order("event_date", { ascending: false })
        .limit(20);
      if (!cancelled) setPastEvents((data ?? []) as PastEvent[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  function handleSelectCommunity(id: string) {
    setCommunityId(id);
    setEventId(null);
  }

  function updatePollOption(index: number, value: string) {
    setPollOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }
  function addPollOption() {
    setPollOptions((prev) => (prev.length < MAX_POLL_OPTIONS ? [...prev, ""] : prev));
  }
  function removePollOption(index: number) {
    setPollOptions((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));
  }

  function handlePost() {
    if (!communityId) {
      setError("Choose which community to post as.");
      return;
    }

    if (postType === "poll") {
      const options = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (!pollQuestion.trim()) {
        setError("Write a poll question.");
        return;
      }
      if (options.length < 2) {
        setError("Add at least two poll options.");
        return;
      }
      setError("");
      startTransition(async () => {
        const result = await createPoll({ community_id: communityId, question: pollQuestion.trim(), options, event_id: eventId });
        if (result.error) setError(result.error);
        else router.push("/feed");
      });
      return;
    }

    if (postType === "video") {
      if (!videoFile) {
        setError("Choose a video to post.");
        return;
      }
      if (videoFile.size > MAX_VIDEO_BYTES) {
        setError("Videos must be under 50MB.");
        return;
      }
      setError("");
      setUploadingVideo(true);
      startTransition(async () => {
        const supabase = createClient();
        const ext = videoFile.name.split(".").pop() ?? "mp4";
        const path = `${communityId}/video/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("community-post-images")
          .upload(path, videoFile, { contentType: videoFile.type || "video/mp4" });
        setUploadingVideo(false);
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        const result = await createVideoPost({ community_id: communityId, caption: videoCaption, video_path: path, event_id: eventId });
        if (result.error) setError(result.error);
        else router.push("/feed");
      });
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await createPost({
        community_id: communityId,
        content: content.text,
        content_content: serializeDescriptionContent(content.json),
        event_id: eventId,
      });
      if (result.error) setError(result.error);
      else router.push("/feed");
    });
  }

  function handlePickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      setError("Choose an MP4, WebM, or MOV video.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Videos must be under 50MB.");
      return;
    }
    setVideoFile(file);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text3">Post as</p>
        <div className="flex flex-wrap gap-2">
          {communities.map((c) => {
            const active = communityId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCommunity(c.id)}
                className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                  active ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPostType("post")}
          className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
            postType === "post" ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
          }`}
        >
          Post
        </button>
        <button
          type="button"
          onClick={() => setPostType("poll")}
          className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
            postType === "poll" ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
          }`}
        >
          Poll
        </button>
        <button
          type="button"
          onClick={() => setPostType("video")}
          className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
            postType === "video" ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
          }`}
        >
          Video
        </button>
      </div>

      {postType === "video" ? (
        <div className="flex flex-col gap-2.5">
          {videoFile ? (
            <div className="flex items-center gap-2 rounded-card-sm border border-border2 bg-bg2 px-3.5 py-3 text-[13px] text-text2">
              <IconVideo size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{videoFile.name}</span>
              <button type="button" onClick={() => setVideoFile(null)} className="text-text3 transition hover:text-pink" aria-label="Remove video">
                <IconX size={16} />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card-sm border border-dashed border-border2 bg-bg2 py-8 text-text2 transition hover:border-green">
              {uploadingVideo ? <IconLoader2 size={22} className="animate-spin" /> : <IconVideo size={22} />}
              <span className="text-[13px] font-semibold">Choose a video</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handlePickVideo} />
            </label>
          )}
          <textarea
            value={videoCaption}
            onChange={(e) => setVideoCaption(e.target.value)}
            placeholder="Write a caption…"
            rows={2}
            className="rounded-card-sm border border-border2 bg-bg2 px-3.5 py-3 text-[14px] text-text outline-none focus:border-green"
          />
        </div>
      ) : postType === "poll" ? (
        <div className="flex flex-col gap-2.5">
          <textarea
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="Ask a question…"
            rows={2}
            className="rounded-card-sm border border-border2 bg-bg2 px-3.5 py-3 text-[14px] text-text outline-none focus:border-green"
          />
          {pollOptions.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={option}
                onChange={(e) => updatePollOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 rounded-card-sm border border-border2 bg-bg2 px-3.5 py-2.5 text-[14px] text-text outline-none focus:border-green"
              />
              {pollOptions.length > 2 && (
                <button type="button" onClick={() => removePollOption(i)} className="text-text3 transition hover:text-text2" aria-label="Remove option">
                  <IconX size={18} />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < MAX_POLL_OPTIONS && (
            <button type="button" onClick={addPollOption} className="flex w-fit items-center gap-1.5 py-1 text-[13px] font-semibold text-green">
              <IconPlus size={15} />
              Add option
            </button>
          )}
        </div>
      ) : (
        <>
          <RichTextEditor
            content={content.json}
            onChange={setContent}
            placeholder="Write something…"
            imageUpload={communityId ? { bucket: "community-post-images", entityId: communityId } : undefined}
          />
          {!communityId && <p className="-mt-2 text-[12px] text-text3">Choose a community above to attach photos.</p>}
        </>
      )}

      {pastEvents.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text3">Link a past event (optional)</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEventId(null)}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                eventId === null ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
              }`}
            >
              None
            </button>
            {pastEvents.map((e) => {
              const active = eventId === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEventId(active ? null : e.id)}
                  className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                    active ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
                  }`}
                >
                  {e.event_name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-center text-[13px] text-pink">{error}</p>}

      <div className="mt-2 flex gap-3">
        <button type="button" onClick={() => router.back()} className="btn-secondary flex-1 justify-center py-3 text-[14px]">
          Cancel
        </button>
        <button type="button" onClick={handlePost} disabled={pending || uploadingVideo} className="btn-primary flex-1 justify-center py-3 text-[14px]">
          {pending || uploadingVideo ? "Posting…" : postType === "poll" ? "Post poll" : postType === "video" ? "Post video" : "Post"}
        </button>
      </div>
    </div>
  );
}
