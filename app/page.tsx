"use client";

import React, { useEffect, useState } from "react";

type Article = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };

const leagueLabel: Record<string, string> = {
  pba: "MBA", mba: "MBA",
  pcaa: "MCAA", mcaa: "MCAA",
  pbgl: "MBGL", mbgl: "MBGL",
};

const leagueColor: Record<string, string> = {
  pba: "#C8102E", mba: "#C8102E",
  pcaa: "#2563eb", mcaa: "#2563eb",
  pbgl: "#BB3430", mbgl: "#BB3430",
};

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/articles")
      .then((r) => r.json())
      .then((d) => {
        setArticles(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main style={{ background: "#080808", minHeight: "100vh", color: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 18px 42px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 26, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {[
              { slug: "mba", label: "MBA" },
              { slug: "mcaa", label: "MCAA" },
              { slug: "mbgl", label: "MBGL" },
            ].map((l) => (
              <a
                key={l.slug}
                href={`/${l.slug}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  border: "1px solid #1d2330",
                  background: "#101318",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  padding: "10px 14px",
                  textDecoration: "none",
                }}
              >
                {l.label}
              </a>
            ))}
          </div>
          <a
            href="https://discord.gg/baWUsXWhdV"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#5865f2",
              color: "white",
              padding: "10px 15px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            Join Discord
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C8102E" }} />
          <span style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Latest News</span>
        </div>

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#64748b" }}>Loading...</div>
        ) : articles.length === 0 ? (
          <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
            No articles yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {articles.map((a) => {
              const league = a.league === "pba" ? "mba" : a.league === "pcaa" ? "mcaa" : a.league === "pbgl" ? "mbgl" : a.league;
              return (
                <a
                  key={a.id}
                  href={`/${league}/articles/${a.id}`}
                  style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 14, padding: 20, textDecoration: "none", display: "block", transition: "border-color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2a3048")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1c2028")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ background: leagueColor[a.league] ?? "#334155", color: "white", fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 6 }}>
                      {leagueLabel[a.league] ?? a.league.toUpperCase()}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 11 }}>
                      {new Date(a.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </span>
                    <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 11 }}>Read more</span>
                  </div>
                  {a.image_url && (
                    <img src={a.image_url} alt="" style={{ borderRadius: 10, marginBottom: 10, maxHeight: 192, objectFit: "cover", width: "100%" }} />
                  )}
                  <h2 style={{ color: "#fff", fontWeight: 800, fontSize: 18, margin: "0 0 8px 0", lineHeight: 1.3 }}>{a.title}</h2>
                  <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                    {a.body}
                  </p>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
