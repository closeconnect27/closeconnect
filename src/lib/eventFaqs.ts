export const EVENT_FAQ_CATEGORIES = [
  "general",
  "tickets",
  "timing",
  "location",
  "parking",
  "food_drinks",
  "age_restrictions",
  "accessibility",
  "what_to_bring",
  "venue",
  "rules",
  "cancellation",
  "refunds",
  "other",
] as const;
export type EventFaqCategory = (typeof EVENT_FAQ_CATEGORIES)[number];

export const EVENT_FAQ_CATEGORY_LABELS: Record<EventFaqCategory, string> = {
  general: "General",
  tickets: "Tickets",
  timing: "Timing",
  location: "Location",
  parking: "Parking",
  food_drinks: "Food & Drinks",
  age_restrictions: "Age Restrictions",
  accessibility: "Accessibility",
  what_to_bring: "What to Bring",
  venue: "Venue",
  rules: "Rules",
  cancellation: "Cancellation",
  refunds: "Refunds",
  other: "Other",
};

// Suggestions only (spec section 37) -- never auto-published, just
// starting points a host can tap to prefill a new row's question.
export const EVENT_FAQ_SUGGESTIONS: string[] = [
  "What time should I arrive?",
  "Where is the event located?",
  "Is parking available?",
  "What should I bring?",
  "Are food and drinks available?",
  "Is there an age restriction?",
  "Can I bring a guest?",
  "Is the venue wheelchair accessible?",
  "What happens if I arrive late?",
  "Can I cancel my ticket?",
  "What is the refund policy?",
];

export type EventFaq = { question: string; answer: string; category: EventFaqCategory; is_published: boolean };

/** Validates/normalizes organizer-entered FAQ rows before they're saved --
 * same "reject rather than silently save something broken" posture as
 * validateCancellationRules. Trims whitespace, drops rows a host left
 * fully blank (an empty draft row from "Add a question" that was never
 * filled in), and enforces the same length limits as the event_faqs table's
 * own CHECK constraints so a bad save fails with a clear message here
 * instead of a raw Postgres error. */
export function validateFaqs(faqs: EventFaq[]): { error: string | null; faqs: EventFaq[] } {
  const cleaned = faqs.map((f) => ({ ...f, question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question || f.answer);

  if (cleaned.length > 20) return { error: "You can add up to 20 FAQ entries.", faqs: [] };
  for (const f of cleaned) {
    if (!f.question) return { error: "Every FAQ needs a question.", faqs: [] };
    if (!f.answer) return { error: "Every FAQ needs an answer.", faqs: [] };
    if (f.question.length > 300) return { error: "A question can be at most 300 characters.", faqs: [] };
    if (f.answer.length > 2000) return { error: "An answer can be at most 2000 characters.", faqs: [] };
    if (!EVENT_FAQ_CATEGORIES.includes(f.category)) return { error: "Choose a valid category.", faqs: [] };
  }
  return { error: null, faqs: cleaned };
}
