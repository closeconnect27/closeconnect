"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash, IconPlus, IconArrowUp, IconArrowDown, IconEye, IconEyeOff } from "@tabler/icons-react";
import { createPlatformFaq, updatePlatformFaq, deletePlatformFaq, togglePlatformFaqPublished, reorderPlatformFaq } from "@/app/actions/platformFaqs";
import { PLATFORM_FAQ_CATEGORIES, PLATFORM_FAQ_CATEGORY_LABELS, type PlatformFaq, type PlatformFaqCategory } from "@/lib/platformFaqs";

const inputClass = "w-full rounded-card-sm border border-border2 bg-bg3 px-3 py-2 text-[13px] transition focus:border-green";

export function PlatformFaqAdmin({ faqs }: { faqs: PlatformFaq[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState<PlatformFaqCategory>("other");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createPlatformFaq({ question: newQuestion, answer: newAnswer, category: newCategory });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewQuestion("");
      setNewAnswer("");
      setNewCategory("other");
      setShowNew(false);
      router.refresh();
    });
  }

  const byCategory = PLATFORM_FAQ_CATEGORIES.map((c) => ({ category: c, items: faqs.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {!showNew ? (
        <button onClick={() => setShowNew(true)} className="btn-primary self-start px-4 py-2.5 text-[13px]">
          <IconPlus size={14} />
          Add FAQ
        </button>
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-card border border-border bg-bg2 p-4">
          <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Question" className={inputClass} />
          <textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} placeholder="Answer" rows={3} className={`resize-none ${inputClass}`} />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as PlatformFaqCategory)} className={inputClass}>
            {PLATFORM_FAQ_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PLATFORM_FAQ_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          {error && <p className="text-[13px] text-pink">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary px-5 py-2 text-[13px]">
              {pending ? "Saving…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowNew(false)} className="btn-secondary px-4 py-2 text-[13px]">
              Cancel
            </button>
          </div>
        </form>
      )}

      {byCategory.map(({ category, items }) => (
        <div key={category}>
          <h3 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-text3">{PLATFORM_FAQ_CATEGORY_LABELS[category]}</h3>
          <div className="flex flex-col gap-2">
            {items.map((f, i) => (
              <FaqRow key={f.id} faq={f} isFirst={i === 0} isLast={i === items.length - 1} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FaqRow({ faq, isFirst, isLast }: { faq: PlatformFaq; isFirst: boolean; isLast: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [category, setCategory] = useState<PlatformFaqCategory>(faq.category);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await updatePlatformFaq(faq.id, { question, answer, category, is_published: faq.is_published });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }
  function handleTogglePublish() {
    startTransition(async () => {
      await togglePlatformFaqPublished(faq.id, !faq.is_published);
      router.refresh();
    });
  }
  function handleDelete() {
    if (!confirm("Delete this FAQ?")) return;
    startTransition(async () => {
      await deletePlatformFaq(faq.id);
      router.refresh();
    });
  }
  function handleReorder(direction: "up" | "down") {
    startTransition(async () => {
      await reorderPlatformFaq(faq.id, direction);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-card-sm border border-border2 bg-bg3 p-3">
        <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} className={inputClass} />
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} className={`resize-none ${inputClass}`} />
        <select value={category} onChange={(e) => setCategory(e.target.value as PlatformFaqCategory)} className={inputClass}>
          {PLATFORM_FAQ_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PLATFORM_FAQ_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {error && <p className="text-[12px] text-pink">{error}</p>}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={pending} className="btn-primary px-4 py-1.5 text-[12px]">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="btn-secondary px-3 py-1.5 text-[12px]">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 rounded-card-sm border p-3 ${faq.is_published ? "border-border2 bg-bg2" : "border-border2 bg-bg3 opacity-60"}`}>
      <div className="flex shrink-0 flex-col gap-1">
        <button onClick={() => handleReorder("up")} disabled={isFirst || pending} className="rounded border border-border2 p-1 text-text3 disabled:opacity-30">
          <IconArrowUp size={11} />
        </button>
        <button onClick={() => handleReorder("down")} disabled={isLast || pending} className="rounded border border-border2 p-1 text-text3 disabled:opacity-30">
          <IconArrowDown size={11} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <button onClick={() => setEditing(true)} className="text-left">
          <p className="text-[13px] font-bold text-text">{faq.question}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-text3">{faq.answer}</p>
        </button>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button onClick={handleTogglePublish} disabled={pending} className="rounded-full border border-border2 p-1.5 text-text3 hover:text-text" title={faq.is_published ? "Unpublish" : "Publish"}>
          {faq.is_published ? <IconEye size={13} /> : <IconEyeOff size={13} />}
        </button>
        <button onClick={handleDelete} disabled={pending} className="rounded-full border border-border2 p-1.5 text-text3 hover:border-pink hover:text-pink">
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  );
}
