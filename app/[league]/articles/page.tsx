"use client";
import React from "react";
import { useParams } from "next/navigation";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College Basketball",
  mbgl: "G League",
};
const leagueLabel: Record<string, string> = {
  mba: "MBA", pba: "MBA",
  mcaa: "MCAA", pcaa: "MCAA",
  mbgl: "MBGL", pbgl: "MBGL",
};
const leagueColor: Record<string, string> = {
  mba: "#C8102E", pba: "#C8102E",
  mcaa: "#003087", pcaa: "#003087",
  mbgl: "#BB3430", pbgl: "#BB3430",
};

type Article = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };

export default function ArticlesPage() {
  const params = useParams();
  const slug = (params?.league as string) ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();
  const label = leagueLabel[slug] ?? slug.toUpperCase();

  const [articles, setArticles] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) return;
    fetch("/api/articles")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const dbSlug = slug === "mba" ? "pba" : slug === "mcaa" ? "pcaa" : slug === "mbgl" ? "pbgl" : slug;
          setArticles(data.filter((a: Article) => a.league === slug || a.league === dbSlug));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white">News</h2>
        <p className="text-slate-500 text-xs mt-0.5">{leagueDisplay}</p>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No articles yet for the {label}.</div>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {articles.map(a => (
            <a key={a.id} href={`/${slug}/articles/${a.id}`}
              className="rounded-xl border border-slate-800 bg-slate-950 p-4 block hover:border-slate-600 transition-colors no-underline">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span style={{ background: leagueColor[a.league] ?? "#333" }}
                  className="text-white text-xs font-bold px-2 py-0.5 rounded">
                  {leagueLabel[a.league] ?? a.league.toUpperCase()}
                </span>
                <span className="text-slate-500 text-xs">
                  {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="ml-auto text-slate-600 text-xs">Read more →</span>
              </div>
              {a.image_url && (
                <img src={a.image_url} alt="" className="rounded-lg mb-3 w-full object-cover" style={{ maxHeight: 200 }} />
              )}
              <h3 className="text-white font-bold text-sm mb-1 leading-snug">{a.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{a.body}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
