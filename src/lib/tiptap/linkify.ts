import { isSafeHttpsUrl } from "@/lib/validators/links";

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * Converts a legacy plain-text description into a Tiptap doc, auto-linking
 * any https:// URLs found in it. The Link extension's `autolink: true`
 * only fires on live user input (typing/paste) -- it never runs over
 * content set programmatically like RichTextView's plainFallback does, so
 * without this a URL already sitting in an old plain-text description
 * column renders as static text, not a clickable link.
 */
export function plainTextToDoc(text: string): object {
  return {
    type: "doc",
    content: text.split("\n").map((line) => {
      const content = lineToInline(line);
      return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  };
}

function lineToInline(line: string): object[] {
  if (!line) return [];
  const nodes: object[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    let end = start + url.length;

    const trailing = url.match(TRAILING_PUNCTUATION)?.[0];
    if (trailing) {
      url = url.slice(0, -trailing.length);
      end -= trailing.length;
    }

    if (!isSafeHttpsUrl(url)) continue;

    if (start > lastIndex) nodes.push({ type: "text", text: line.slice(lastIndex, start) });
    nodes.push({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] });
    lastIndex = end;
  }

  if (lastIndex < line.length) nodes.push({ type: "text", text: line.slice(lastIndex) });
  return nodes;
}
