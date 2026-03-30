"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

const leagues = [
  { short: "MBA",  full: "Minecraft Basketball Association", slug: "mba",  logo: "/logos/mba.webp",  accent: "#C8102E" },
  { short: "MCAA", full: "College",                          slug: "mcaa", logo: "/logos/mcaa.webp", accent: "#003087" },
  { short: "MBGL", full: "G League",                         slug: "mbgl", logo: "/logos/MBGL.png", accent: "#BB3430" },
];

const tabs = [
  { label: "Home",        path: "",           global: false, only: null },
  { label: "Teams",       path: "/teams",     global: false, only: null },
  { label: "Standings",   path: "/standings", global: false, only: null },
  { label: "Schedule",    path: "/schedule",  global: false, only: null },
  { label: "Box Scores",  path: "/boxscores", global: false, only: null },
  { label: "Stats",       path: "/stats",     global: false, only: null },
  { label: "Players",     path: "/players",   global: false, only: null },
  { label: "Accolades",   path: "/accolades", global: false, only: null },
  { label: "Auction",     path: "/auction",   global: false, only: ["mba"] },
  { label: "Mini Games",  path: "/games",     global: false, only: null },
  { label: "Links",       path: "/links",     global: true,  only: null },
  { label: "Admin",       path: "/admin",     global: false, only: null },
];

export default function Header() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [selected, setSelected] = useState<string>("mba");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("partix:selectedLeague");
    // migrate old pba/pcaa/pbgl keys
    const migrated = saved === "pba" ? "mba" : saved === "pcaa" ? "mcaa" : saved === "pbgl" ? "mbgl" : saved;
    if (migrated) setSelected(migrated);
  }, []);

  useEffect(() => {
    localStorage.setItem("partix:selectedLeague", selected);
  }, [selected]);

  const currentLeague = leagues.find((l) => l.slug === selected) ?? leagues[0];

  const parts = pathname.split("/");
  const section = parts.length >= 3 ? `/${parts[2]}` : "";

  return (
    <header className="sticky top-0 z-40" style={{ background: "#0e0e0e", borderBottom: "1px solid #1e1e1e" }}>
      {/* Top bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
        {/* Logo + league name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-12 flex-shrink-0 drop-shadow-lg">
            <Image
              src={currentLeague.logo}
              alt={currentLeague.short}
              width={40}
              height={48}
              className="w-full h-full object-contain"
              unoptimized
            />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight tracking-wide">Minecraft Basketball</div>
            <div className="text-xs leading-tight" style={{ color: "#888" }}>{currentLeague.full}</div>
          </div>
        </div>

        {/* League switcher */}
        <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: "#161616", border: "1px solid #252525" }}>
          {leagues.map((l) => (
            <button
              key={l.slug}
              onClick={() => {
                setSelected(l.slug);
                const currentTab = tabs.find(t => !t.global && (t.path === "" ? section === "" : section === t.path));
                const targetPath = currentTab && !currentTab.global ? `/${l.slug}${currentTab.path}` : `/${l.slug}`;
                router.push(targetPath);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all duration-150"
              style={selected === l.slug
                ? { background: l.accent, color: "white", boxShadow: `0 2px 8px ${l.accent}55` }
                : { color: "#666", background: "transparent" }
              }
            >
              {l.short}
            </button>
          ))}
        </div>
      </div>

      {/* Nav tabs */}
      <div className="overflow-x-auto" style={{ background: "#0a0a0a", borderTop: "1px solid #181818" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex">
          {tabs.filter((tab) => !tab.only || tab.only.includes(selected)).map((tab) => {
            const href = tab.global ? tab.path : `/${selected}${tab.path}`;
            const isActive = tab.global
              ? pathname === tab.path
              : tab.path === ""
                ? section === "" || section === undefined
                : section === tab.path;
            return (
              <Link
                key={tab.label}
                href={href}
                className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap tracking-wide transition-all duration-150"
                style={isActive
                  ? { borderBottom: `2px solid ${currentLeague.accent}`, color: "white" }
                  : { borderBottom: "2px solid transparent", color: "#555" }
                }
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#aaa"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#555"; }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
