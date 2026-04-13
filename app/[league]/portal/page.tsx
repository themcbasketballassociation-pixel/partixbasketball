"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PortalEntry = {
  id: string;
  mc_uuid: string;
  amount: number;
  season: string | null;
  status: string;
  players: { mc_uuid: string; mc_username: string };
  teams: { id: string; name: string; abbreviation: string } | null;
};

export default function TransferPortalPage() {
  const params = useParams();
  const leagueSlug = (params?.league as string) ?? "mcaa";

  const [entries, setEntries] = useState<PortalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [reqRes, approvedRes] = await Promise.all([
        fetch(`/api/contracts?league=${leagueSlug}&status=portal_requested`),
        fetch(`/api/contracts?league=${leagueSlug}&status=in_portal`),
      ]);
      const requested = await reqRes.json().catch(() => []);
      const inPortal = await approvedRes.json().catch(() => []);
      const all = [...(Array.isArray(inPortal) ? inPortal : []), ...(Array.isArray(requested) ? requested : [])];
      setEntries(all);
      setLoading(false);
    };
    load();
  }, [leagueSlug]);

  if (leagueSlug !== "mcaa") {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", background: "#111", border: "1px solid #222", borderRadius: 16, padding: 40, textAlign: "center" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Not Available</div>
        <div style={{ color: "#555", fontSize: 14 }}>The transfer portal is only available for the MCAA.</div>
      </div>
    );
  }

  const inPortal = entries.filter((e) => e.status === "in_portal");
  const pending = entries.filter((e) => e.status === "portal_requested");

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 26, marginBottom: 4 }}>MCAA Transfer Portal</div>
        <div style={{ color: "#555", fontSize: 14 }}>Players who have entered or requested to enter the transfer portal.</div>
      </div>

      {loading ? (
        <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>No players in the portal right now.</div>
      ) : (
        <>
          {inPortal.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                In Portal ({inPortal.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {inPortal.map((e) => <PortalCard key={e.id} entry={e} />)}
              </div>
            </section>
          )}
          {pending.length > 0 && (
            <section>
              <div style={{ color: "#f97316", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                Pending Approval ({pending.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pending.map((e) => <PortalCard key={e.id} entry={e} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PortalCard({ entry }: { entry: PortalEntry }) {
  const isApproved = entry.status === "in_portal";
  return (
    <div style={{ background: "#111", border: `1px solid ${isApproved ? "#164e63" : "#292524"}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
      <img
        src={`https://minotar.net/avatar/${entry.players.mc_username}/40`}
        style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid #222", flexShrink: 0 }}
        onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }}
        alt=""
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{entry.players.mc_username}</div>
        <div style={{ color: "#555", fontSize: 12 }}>
          From: {entry.teams?.name ?? "Unknown Team"}{entry.season ? ` · ${entry.season}` : ""}
        </div>
      </div>
      <div>
        {isApproved ? (
          <span style={{ background: "#0a1a1f", border: "1px solid #164e63", color: "#22d3ee", borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 10px" }}>In Portal</span>
        ) : (
          <span style={{ background: "#1c1200", border: "1px solid #78350f", color: "#f97316", borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 10px" }}>Pending</span>
        )}
      </div>
    </div>
  );
}
