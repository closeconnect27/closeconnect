// Ported verbatim from reference/reference_current_index.html's CAT_IMAGES /
// getCatImage -- these specific Unsplash photo IDs were already debugged in
// production (some hand-picked IDs turned out broken and were removed), so
// don't substitute new ones. Only the 8 categories lib/categories.ts
// actually uses are carried over here (the reference has 20 -- the other 12
// don't exist in this app's taxonomy).
//
// Re-verified every ID with a live HEAD request when porting (2026-07-04):
// 3 of the 72 had gone dead since the reference was last touched (Unsplash
// photos do get taken down over time) -- removed rather than replaced with
// unverified guesses: photo-1578926288207-a90a5366b7b3 (arts),
// photo-1501386761578-eaa54b1a8bf3 (music), photo-1559595500-e15296d1b8a4
// (wellness). Re-check periodically; this will happen again.
const CAT_IMAGES: Record<string, string[]> = {
  sports: [
    "photo-1571019614242-c5c5dee9f50b",
    "photo-1517649763962-0c623066013b",
    "photo-1579952363873-27f3bade9f55",
    "photo-1574629810360-7efbbe195018",
    "photo-1552674605-db6ffd4facb5",
    "photo-1461896836934-ffe607ba8211",
    "photo-1546519638-68e109498ffc",
    "photo-1591343395082-e120087004b4",
  ],
  tech: [
    "photo-1518770660439-4636190af475",
    "photo-1526374965328-7f61d4dc18c5",
    "photo-1504384308090-c894fdcc538d",
    "photo-1550751827-4bd374c3f58b",
    "photo-1498050108023-c5249f4df085",
    "photo-1484557052118-f32bd25b45b5",
    "photo-1461749280684-dccba630e2f6",
    "photo-1486312338219-ce68d2c6f44d",
  ],
  arts: [
    "photo-1460661419201-fd4cecdf8a8b",
    "photo-1513364776144-60967b0f800f",
    "photo-1579783902614-a3fb3927b6a5",
    "photo-1561214115-f2f134cc4912",
    "photo-1547826039-bfc35e0f1ea8",
    "photo-1615184697985-c9bde1b07da7",
    "photo-1604871000636-074fa5117945",
  ],
  food: [
    "photo-1567620905732-2d1ec7ab7445",
    "photo-1504674900247-0877df9cc836",
    "photo-1476224203421-9ac39bcb3327",
    "photo-1414235077428-338989a2e8c0",
    "photo-1455619452474-d2be8b1e70cd",
    "photo-1540189549336-e6e99c3679fe",
    "photo-1565299624946-b28f40a0ae38",
    "photo-1482049016688-2d3e1b311543",
  ],
  music: [
    "photo-1511671782779-c97d3d27a1d4",
    "photo-1493225457124-a3eb161ffa5f",
    "photo-1470225620780-dba8ba36b745",
    "photo-1514320291840-2e0a9bf2a9ae",
    "photo-1415201364774-f6f0bb35f28f",
    "photo-1506157786151-b8491531f063",
    "photo-1528722828814-77b9b83aafb2",
  ],
  wellness: [
    "photo-1506126613408-eca07ce68773",
    "photo-1545205597-3d9d02c29597",
    "photo-1544367567-0f2fcb009e0b",
    "photo-1588286840104-8957b019727f",
    "photo-1518611012118-696072aa579a",
    "photo-1571019613454-1cb2f99b2d8b",
    "photo-1549576490-b0b4831ef60a",
  ],
  gaming: [
    "photo-1542751371-adc38448a05e",
    "photo-1593305841991-05c297ba4575",
    "photo-1552820728-8b83bb6b773f",
    "photo-1538481199705-c710c4e965fc",
    "photo-1586182987320-4f376d39d787",
    "photo-1612287230202-1ff1d85d1bdf",
    "photo-1511512578047-dfb367046420",
    "photo-1547394765-185e1e68f34e",
  ],
  social: [
    "photo-1529156069898-49953e39b3ac",
    "photo-1543269865-cbf427effbad",
    "photo-1511632765486-a01980e01a18",
    "photo-1528605248644-14dd04022da1",
    "photo-1522202176988-66273c2fd55f",
    "photo-1521737604893-d14cc237f11d",
    "photo-1516321318423-f06f85e504b3",
    "photo-1517457373958-b7bdd4587205",
  ],
  other: [
    "photo-1529156069898-49953e39b3ac",
    "photo-1540575467063-178a50c2df87",
    "photo-1517457373958-b7bdd4587205",
    "photo-1582213782179-e0d53f98f2ca",
    "photo-1491438590914-bc09fcaaf77a",
    "photo-1521737604893-d14cc237f11d",
    "photo-1528605248644-14dd04022da1",
    "photo-1522202176988-66273c2fd55f",
  ],
};

/** Same seed derivation as the reference: first character's code point. */
export function communitySeed(id: string | null | undefined): number {
  return (id || "x").charCodeAt(0) || 0;
}

export function getCategoryImage(slug: string, seed: number, size: { w: number; h: number } = { w: 640, h: 360 }) {
  const ids = CAT_IMAGES[slug] || CAT_IMAGES.other;
  const id = ids[Math.abs(seed || 0) % ids.length];
  return `https://images.unsplash.com/${id}?w=${size.w}&h=${size.h}&fit=crop&q=80&auto=format`;
}
