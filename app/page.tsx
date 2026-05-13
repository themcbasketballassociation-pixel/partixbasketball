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
  pcaa: "#003087", mcaa: "#003087",
  pbgl: "#BB3430", mbgl: "#BB3430",
};

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/articles")
      .then(r => r.json())
      .then(d => { setArticles(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main style={{ background: "#080808", minHeight: "100vh" }}>

      {/* ── HERO ── */}
      <div style={{ position: "relative", overflow: "hidden", background: "#080808", borderBottom: "1px solid #131820" }}>
        <div style={{
          position: "absolute", left: "-5%", top: "50%", transform: "translateY(-50%)",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, #C8102E12 0%, transparent 65%)",
          pointerEvents: "none",
        }} />
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 24px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#C8102E", display: "inline-block" }} />
            <span style={{ color: "#555", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              Partix Sports Network
            </span>
          </div>
          <h1 style={{ margin: "0 0 16px 0", lineHeight: 1.05 }}>
            <span style={{ display: "block", color: "#fff", fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 900 }}>Minecraft Basketball</span>
          </h1>
          <p style={{ color: "#4a4a4a", fontSize: 14, lineHeight: 1.65, margin: "0 0 28px 0", maxWidth: 480 }}>
            The premier Minecraft basketball experience — real teams, real stats, real competition across the MBA, MCAA, and G League.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <a
              href="/mba"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#C8102E", color: "white", padding: "11px 22px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#a50d26")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#C8102E")}
            >
              🏀 Enter the MBA
            </a>
            <a
              href="https://discord.gg/baWUsXWhdV"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#5865f2", color: "white", padding: "11px 22px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#4752c4")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#5865f2")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Join Discord
            </a>
          </div>

          {/* League links */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            {[
              { slug: "mba", label: "MBA", color: "#C8102E", full: "Minecraft Basketball Association" },
              { slug: "mcaa", label: "MCAA", color: "#003087", full: "College Basketball" },
            ].map((l) => (
              <a
                key={l.slug}
                href={`/${l.slug}`}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#101318", border: "1px solid #1c2028", borderRadius: 10, padding: "8px 14px", textDecoration: "none", transition: "border-color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2a3048")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1c2028")}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em" }}>{l.label}</span>
                <span style={{ color: "#444", fontSize: 11 }}>{l.full}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── NEWS ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 15 }}>📰</span>
          <span style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Latest News</span>
        </div>

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#333" }}>Loading...</div>
        ) : articles.length === 0 ? (
          <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "#2a2a2a", fontSize: 13 }}>
            No articles yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {articles.map(a => {
              const league = a.league === "pba" ? "mba" : a.league === "pcaa" ? "mcaa" : a.league === "pbgl" ? "mbgl" : a.league;
              return (
                <a
                  key={a.id}
                  href={`/${league}/articles/${a.id}`}
                  style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 14, padding: "20px", textDecoration: "none", display: "block", transition: "border-color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2a3048")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1c2028")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ background: leagueColor[a.league] ?? "#333", color: "white", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 6 }}>
                      {leagueLabel[a.league] ?? a.league.toUpperCase()}
                    </span>
                    <span style={{ color: "#444", fontSize: 11 }}>
                      {new Date(a.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </span>
                    <span style={{ marginLeft: "auto", color: "#333", fontSize: 11 }}>Read more →</span>
                  </div>
                  {a.image_url && (
                    <img src={a.image_url} alt="" style={{ borderRadius: 10, marginBottom: 10, maxHeight: 192, objectFit: "cover", width: "100%" }} />
                  )}
                  <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 18, margin: "0 0 8px 0", lineHeight: 1.3 }}>{a.title}</h2>
                  <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6, margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
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
