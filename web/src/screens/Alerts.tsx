import { useEffect, useRef, useState } from "react";
import { api, type Notification } from "../api";
import { useI18n } from "../i18n/context";
import { fmtRelative } from "../i18n/format";
import { categoryLabel, channelLabel, scriptFont } from "../i18n/content";
import { localeOf } from "../i18n/strings";
import { useQuery } from "../hooks/useQuery";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

export function Alerts() {
  const { t, lang, font } = useI18n();
  const toast = useToast();
  const { data: items, loading, error, refetch } = useQuery(() => api.notifications(), []);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const queueRef = useRef<string[]>([]);

  const resolved = (Array.isArray(items) ? items : []).map((n) => readIds.has(n.id) ? { ...n, read: true } : n);

  // A tab change or unmount must not leave the phone talking to itself.
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  async function markRead(id: string) {
    await api.markRead(id);
    setReadIds((s) => new Set(s).add(id));
  }

  /** Speaks in the language the message was actually sent in (mock data has none set, so it follows the toggle). */
  function speak(n: Notification, onDone: () => void) {
    const text = n.body[lang] || n.body.en || "";
    if (!("speechSynthesis" in window) || !text) return onDone();
    const targetLang = n.language ?? lang;
    const locale = localeOf(targetLang);
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0 && !voices.some((v) => v.lang === locale || v.lang.startsWith(targetLang))) {
      toast(t("voiceUnavailable"));
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.onend = onDone;
    u.onerror = onDone;
    window.speechSynthesis.speak(u);
  }

  function stopReading() {
    queueRef.current = [];
    window.speechSynthesis?.cancel();
    setPlayingId(null);
  }

  function toggleOne(n: Notification) {
    if (playingId === n.id) return stopReading();
    queueRef.current = [];
    window.speechSynthesis?.cancel();
    setPlayingId(n.id);
    speak(n, () => setPlayingId((p) => (p === n.id ? null : p)));
  }

  function playNextQueued() {
    const id = queueRef.current.shift();
    if (!id) return setPlayingId(null);
    const n = resolved.find((x) => x.id === id);
    if (!n) return playNextQueued();
    setPlayingId(id);
    speak(n, playNextQueued);
  }

  function toggleReadAll() {
    if (playingId != null) return stopReading();
    const unread = resolved.filter((n) => !n.read);
    if (unread.length === 0) return toast(t("noAlerts"));
    queueRef.current = unread.map((n) => n.id);
    playNextQueued();
  }

  return (
    <>
      <StatusBar right={t("alerts")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 className="h-display" style={{ margin: "6px 0 6px", fontSize: 31 }}>{t("alerts")}</h2>
          <p style={{ margin: "0 0 18px", fontSize: 14.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>
            {t("alertsSaved")}
          </p>

          {error ? (
            <ErrorCard message={t("errorRetry")} onRetry={refetch} retryLabel={t("retry")} />
          ) : loading ? (
            <SkeletonList count={3} height={80} />
          ) : resolved.length === 0 ? (
            <EmptyCard message={t("noAlerts")} font={font} />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {resolved.map((n) => {
                const dark = !n.read;
                const playing = playingId === n.id;
                return (
                  <div key={n.id} style={{ position: "relative", borderRadius: 26, background: dark ? "var(--green-ink)" : "#fff", boxShadow: dark ? "none" : "0 8px 20px rgba(30,59,35,.06)" }}>
                    <button type="button" onClick={() => markRead(n.id)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "18px 56px 18px 20px", color: dark ? "var(--on-dark)" : "var(--green-ink)", background: "transparent" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: dark ? "var(--marigold)" : "var(--muted-2)", fontFamily: scriptFont(categoryLabel(n.category, t)) }}>{categoryLabel(n.category, t)}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: dark ? "var(--on-dark-3)" : "var(--muted-2)", fontFamily: font }}>{fmtRelative(n.createdAt, lang)} · {channelLabel(n.channel, t)}</span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 15.5, fontWeight: 700, lineHeight: 1.5, fontFamily: scriptFont(n.body[lang] || n.body.en || "") }}>
                        {n.body[lang] || n.body.en || ""}
                      </div>
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleOne(n); }}
                      aria-label={playing ? t("stopReading") : t("listenAlert")}
                      style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 15, border: 0, background: dark ? "rgba(255,248,236,.16)" : "var(--field)", color: dark ? "var(--on-dark)" : "var(--green-ink)" }}>
                      {playing ? "⏸" : "🔊"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" onClick={toggleReadAll} style={{ marginTop: "auto", minHeight: 64, border: "2.5px solid var(--leaf)", borderRadius: 999, background: "transparent", color: "var(--leaf-text)", fontSize: 16, fontWeight: 800, fontFamily: font }}>
            {playingId != null ? t("stopReading") : t("readToMe")}
          </button>
        </div>
      </ScreenBody>
      <TabBar unread={resolved.filter((n) => !n.read).length} />
    </>
  );
}

function SkeletonList({ count, height }: { count: number; height: number }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ height, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

function ErrorCard({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{message}</div>
      <button type="button" onClick={onRetry} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{retryLabel}</button>
    </div>
  );
}

function EmptyCard({ message, font }: { message: string; font: string }) {
  return (
    <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "var(--amber-soft)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font, textAlign: "center" }}>
      {message}
    </div>
  );
}
