"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";

/**
 * Inline search scoped to one page (communities or events), replacing the
 * shared /search route -- each page now searches its own content directly,
 * merging `q` into whatever category/city/type/date filters are already in
 * the URL rather than navigating away to a separate results page.
 */
export function PageSearch({ basePath, placeholder }: { basePath: string; placeholder: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim();
        const params = new URLSearchParams(searchParams.toString());
        if (q) params.set("q", q);
        else params.delete("q");
        router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
      }}
      className="flex w-full items-center gap-3 rounded-full border border-border2 bg-bg3 px-4 py-2.5 transition focus-within:border-green sm:max-w-md"
    >
      <IconSearch size={16} className="shrink-0 text-text3" />
      <input
        name="q"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-text3"
      />
    </form>
  );
}
