"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";

export function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }}
      className="flex items-center gap-3 rounded-full border border-border2 bg-bg3 px-4 py-3 transition focus-within:border-green"
    >
      <IconSearch size={16} className="text-text3" />
      <input
        name="q"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder="search communities and events…"
        className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-text3"
      />
    </form>
  );
}
