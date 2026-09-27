import { useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n/context";
import { fmtNumber } from "../i18n/format";
import type { Lang } from "../i18n/strings";
import { useQuery } from "../hooks/useQuery";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

const CROPS = ["Wheat", "Paddy", "Maize"] as const;
const CROP_I18N: Record<string, string> = { Wheat: "cropWheat", Paddy: "cropPaddy", Maize: "cropMaize" };

type Listing = {
  id: string; crop: string; qtl: number; askingPrice: number;
  village: string; district: string; createdAt: string;
  farmerName: string | null; farmerMobile: string;
};

export function Listings() {
  const { t, lang, font } = useI18n();
  const toast = useToast();
  const [filterCrop, setFilterCrop] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery(
    () => api.getListings(filterCrop === "all" ? undefined : filterCrop),
    [filterCrop],
  );
  const listings: Listing[] = data ?? [];

  return (
    <>
      <StatusBar right={t("listingsTitle")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 16 }}>
            <h2 className="h-display" style={{ margin: 0, fontSize: 28 }}>{t("listingsTitle")}</h2>
            <button type="button" onClick={() => setShowForm((v) => !v)}
              style={{ height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: showForm ? "var(--terra)" : "var(--green-ink)", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: font }}>
              {showForm ? t("cancel") : `+ ${t("postListing")}`}
            </button>
          </div>

          {showForm && <PostForm t={t} font={font} lang={lang} onPosted={() => { setShowForm(false); refetch(); toast(t("listingPosted")); }} />}

          {/* Crop filter chips */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
            {(["all", ...CROPS] as string[]).map((c) => (
              <button key={c} type="button" onClick={() => setFilterCrop(c)}
                style={{ flexShrink: 0, height: 36, padding: "0 16px", borderRadius: 999, border: 0, background: filterCrop === c ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: filterCrop === c ? "#fff" : "var(--muted)", fontSize: 13.5, fontWeight: 800, fontFamily: font }}>
                {c === "all" ? t("allCrops") : t(CROP_I18N[c])}
              </button>
            ))}
          </div>

          {error ? (
            <div style={{ padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--terra)" }}>{t("errorRetry")}</div>
              <button type="button" onClick={refetch} style={{ marginTop: 12, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{t("retry")}</button>
            </div>
          ) : loading ? (
            <div style={{ display: "grid", gap: 12 }}>
              {[1, 2, 3].map((i) => <div key={i} style={{ height: 110, borderRadius: 24, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />)}
            </div>
          ) : listings.length === 0 ? (
            <div style={{ margin: "auto 0", padding: "32px 22px", borderRadius: 26, background: "var(--amber-soft)", textAlign: "center", fontSize: 15, fontWeight: 700, color: "var(--amber-text-2)", fontFamily: font }}>
              {t("noListings")}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} revealed={revealId === l.id} onReveal={() => setRevealId(l.id)} t={t} font={font} lang={lang} />
              ))}
            </div>
          )}
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}

function ListingCard({ listing: l, revealed, onReveal, t, font, lang }: {
  listing: Listing; revealed: boolean; onReveal: () => void;
  t: (k: string) => string; font: string; lang: Lang;
}) {
  const daysAgo = Math.floor((Date.now() - new Date(l.createdAt).getTime()) / 86_400_000);
  return (
    <div style={{ borderRadius: 24, background: "#fff", boxShadow: "0 8px 20px rgba(30,59,35,.06)", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".07em", color: "var(--muted)", fontFamily: font, marginBottom: 4 }}>
            {l.village}, {l.district}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--green-ink)" }}>
            {l.crop} · {l.qtl} qtl
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="h-display" style={{ fontSize: 24, color: "var(--leaf-text)" }}>₹{fmtNumber(l.askingPrice, lang)}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>{t("perQuintal")}</div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>
          {daysAgo === 0 ? t("today") : `${daysAgo}d ${t("ago")}`} · {l.farmerName ?? t("farmer")}
        </span>
        {revealed ? (
          <a href={`tel:${l.farmerMobile}`}
            style={{ height: 36, padding: "0 16px", borderRadius: 999, background: "var(--leaf)", color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", textDecoration: "none" }}>
            📞 {l.farmerMobile}
          </a>
        ) : (
          <button type="button" onClick={onReveal}
            style={{ height: 36, padding: "0 16px", borderRadius: 999, border: "2px solid var(--leaf)", background: "transparent", color: "var(--leaf-text)", fontSize: 13, fontWeight: 800, fontFamily: font }}>
            {t("callFarmer")}
          </button>
        )}
      </div>
    </div>
  );
}

function PostForm({ t, font, onPosted }: { t: (k: string) => string; font: string; lang: string; onPosted: () => void }) {
  const [crop, setCrop] = useState<string>("Wheat");
  const [qtl, setQtl] = useState("");
  const [price, setPrice] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("");
  const [saving, setSaving] = useState(false);

  const inputStyle = { width: "100%", height: 48, borderRadius: 14, border: "2px solid var(--border)", padding: "0 14px", fontSize: 15, fontWeight: 700, background: "#fff", color: "var(--green-ink)", boxSizing: "border-box" as const };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!qtl || !price || !village || !district) return;
    setSaving(true);
    try {
      await api.postListing({ crop, qtl: Number(qtl), askingPrice: Number(price), village, district });
      onPosted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 20, padding: "18px 18px 20px", borderRadius: 24, background: "var(--field)", display: "grid", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".07em", color: "var(--muted)", fontFamily: font }}>{t("postListing").toUpperCase()}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {CROPS.map((c) => (
          <button key={c} type="button" onClick={() => setCrop(c)}
            style={{ flex: 1, height: 42, borderRadius: 14, border: 0, background: c === crop ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: c === crop ? "#fff" : "var(--muted)", fontSize: 13.5, fontWeight: 800, fontFamily: font }}>
            {t(CROP_I18N[c])}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input type="number" placeholder={`${t("quantity")} (qtl)`} value={qtl} onChange={(e) => setQtl(e.target.value)} style={inputStyle} required min={1} max={500} />
        <input type="number" placeholder="₹ / qtl" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} required min={1} max={10000} />
      </div>
      <input type="text" placeholder={t("village")} value={village} onChange={(e) => setVillage(e.target.value)} style={inputStyle} required maxLength={100} />
      <input type="text" placeholder={t("district")} value={district} onChange={(e) => setDistrict(e.target.value)} style={inputStyle} required maxLength={100} />
      <button type="submit" disabled={saving}
        style={{ height: 50, borderRadius: 16, border: 0, background: "var(--green-ink)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: font, opacity: saving ? .6 : 1 }}>
        {saving ? "…" : t("postListing")}
      </button>
    </form>
  );
}
