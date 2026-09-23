export const PLATFORM_FAQ_CATEGORIES = [
  "getting_started",
  "account",
  "events",
  "tickets",
  "payments",
  "cancellation_refunds",
  "organizers",
  "payouts",
  "safety",
  "other",
] as const;
export type PlatformFaqCategory = (typeof PLATFORM_FAQ_CATEGORIES)[number];

export const PLATFORM_FAQ_CATEGORY_LABELS: Record<PlatformFaqCategory, string> = {
  getting_started: "Getting Started",
  account: "Account",
  events: "Events",
  tickets: "Tickets",
  payments: "Payments",
  cancellation_refunds: "Cancellation & Refunds",
  organizers: "Organizers",
  payouts: "Payouts",
  safety: "Safety",
  other: "Other",
};

export type PlatformFaq = {
  id: string;
  question: string;
  answer: string;
  category: PlatformFaqCategory;
  display_order: number;
  is_published: boolean;
};

export function validatePlatformFaq(input: { question: string; answer: string; category: string }): string | null {
  if (!input.question.trim()) return "Enter a question.";
  if (input.question.length > 300) return "Question can be at most 300 characters.";
  if (!input.answer.trim()) return "Enter an answer.";
  if (input.answer.length > 4000) return "Answer can be at most 4000 characters.";
  if (!PLATFORM_FAQ_CATEGORIES.includes(input.category as PlatformFaqCategory)) return "Choose a valid category.";
  return null;
}
