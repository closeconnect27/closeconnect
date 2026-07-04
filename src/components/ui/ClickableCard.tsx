"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, KeyboardEvent, MouseEvent } from "react";

/**
 * A whole-area-clickable card that can safely contain real, independently
 * clickable descendants (a join button, a report link, etc.) -- which a
 * plain `<Link>` wrapper can't, since nested <a> is invalid HTML (browsers
 * end the outer anchor early, breaking layout/click targets unpredictably,
 * not just a hydration warning). Descendants that need their own click
 * target must stopPropagation() in their own onClick so this card's
 * navigation doesn't also fire -- see JoinBadge for the pattern.
 *
 * Not a substitute for `<Link>` when the card has no interactive
 * descendants -- plain links are simpler, keyboard/SEO-friendly by
 * default, and don't need this. Reach for this specifically when you hit
 * the nested-anchor problem, which will recur for any card with an
 * embedded action button (e.g. event cards' Register button in Phase 7).
 */
export function ClickableCard({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function navigate() {
    router.push(href);
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    // Descendants that already handled their own navigation/action call
    // stopPropagation(), so this only fires for clicks on the card itself.
    if (e.defaultPrevented) return;
    navigate();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate();
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {children}
    </div>
  );
}
