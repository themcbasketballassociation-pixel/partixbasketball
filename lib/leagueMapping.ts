// Maps new public-facing slugs (mba/mcaa/mbgl) to the DB identifiers (pba/pcaa/pbgl)
const LEAGUE_MAP: Record<string, string> = {
  mba:  "pba",
  mcaa: "pcaa",
  mbgl: "pbgl",
};

export function resolveLeague(slug: string | string[] | undefined): string {
  const s = Array.isArray(slug) ? slug[0] : (slug ?? "");
  return LEAGUE_MAP[s] ?? s;
}
