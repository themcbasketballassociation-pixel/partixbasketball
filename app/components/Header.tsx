"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useSession, signIn } from "next-auth/react";

const leagues = [
  { short: "MBA",  full: "Minecraft Basketball Association", slug: "mba",  logo: "/logos/mba.webp",  accent: "#C8102E" },
  { short: "MCAA", full: "College",                          slug: "mcaa", logo: "/logos/mcaa.webp", accent: "#003087" },
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
  { label: "Portal",      path: "/portal",    global: false, only: ["mcaa"] },
  { label: "Mini Games",  path: "/games",     global: false, only: null },
  { label: "Links",       path: "/links",     global: true,  only: null },
  { label: "Admin",       path: "/admin",     global: false, only: null },
];

export default function Header() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [selected, setSelected] = useState<string>("mba");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    const saved = localStorage.getItem("partix:selectedLeague");
    // migrate old pba/pcaa/pbgl keys
    const migrated = saved === "pba" ? "mba" : saved === "pcaa" ? "mcaa" : saved === "pbgl" || saved === "mbgl" ? "mba" : saved;
    if (migrated) setSelected(migrated);
  }, []);

  useEffect(() => {
    localStorage.setItem("partix:selectedLeague", selected);
  }, [selected]);

  const currentLeague = leagues.find((l) => l.slug === selected) ?? leagues[0];

  const parts = pathname.split("/");
  const section = parts.length >= 3 ? `/${parts[2]}` : "";

  return (
    <header className="sticky top-0 z-40" style={{ background: "#0c0f18", borderBottom: "1px solid #1c2028" }}>
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

        {/* Profile button (top-right) */}
        <div className="flex items-center gap-3 ml-auto">
          {session ? (
            <Link
              href={`/${selected}/profile`}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition hover:bg-slate-800"
              title="Your Profile"
            >
              {session.user?.image ? (
                <img src={session.user.image} className="w-7 h-7 rounded-full ring-1 ring-slate-600" alt="" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-800 flex items-center justify-center text-xs text-white font-bold">
                  {session.user?.name?.[0] ?? "?"}
                </div>
              )}
              <span className="text-xs text-slate-400 hidden sm:block max-w-[80px] truncate">{session.user?.name}</span>
            </Link>
          ) : (
            <button
              onClick={() => signIn("discord")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              style={{ background: "#5865f2", color: "white" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#4752c4")}
              onMouseLeave={e => (e.currentTarget.style.background = "#5865f2")}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Sign In
            </button>
          )}
        </div>

        {/* League switcher */}
        <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: "#13161e", border: "1px solid #232838" }}>
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
      <div className="overflow-x-auto" style={{ background: "#090c14", borderTop: "1px solid #171b26" }}>
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
