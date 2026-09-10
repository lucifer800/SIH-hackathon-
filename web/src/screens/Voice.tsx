import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type AssistAnswer } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody } from "../ui";

/**
 * Voice assist is a first-class path, not a novelty (SIH: answers turn, money and
 * rate without reading the screen). Input uses the Web Speech API when available;
 * output is spoken back with speechSynthesis in the chosen language.
 */
export function Voice() {
  const { t, lang, font } = useI18n();
  const nav = useNavigate();
  const [listening, setListening] = useState(false);
  const [answer, setAnswer] = useState<AssistAnswer | null>(null);
  const [heard, setHeard] = useState("");

  async function ask(text: string) {
    setHeard(text);
    const res = await api.assist(text, lang);
    setAnswer(res);
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(res.answer);
      u.lang = lang === "pa" ? "pa-IN" : lang === "hi" ? "hi-IN" : "en-IN";
      window.speechSynthesis.speak(u);
    }
  }

  function listen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setListening(true); setTimeout(() => { setListening(false); ask(t("qTurn")); }, 1400); return; }
    const rec = new SR();
    rec.lang = lang === "pa" ? "pa-IN" : lang === "hi" ? "hi-IN" : "en-IN";
    rec.onresult = (e: any) => ask(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  const suggestions = [t("qTurn"), t("qMoney"), t("qRate")];

  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, var(--green-deep), var(--green-mid) 60%, var(--green-light))", display: "flex", flexDirection: "column" }}>
      <StatusBar right="" />
      <ScreenBody style={{ display: "flex", flexDirection: "column", color: "var(--on-dark)" }}>
        <button type="button" onClick={() => nav("/home")} style={{ alignSelf: "flex-start", color: "var(--on-dark-3)", fontSize: 14, fontWeight: 700 }}>← {t("tabHome")}</button>

        <div className="h-display" style={{ marginTop: 18, fontSize: 25, color: "var(--on-dark)", fontFamily: font }}>{heard || t("voiceTitle")}</div>

        <Waveform on={listening} />

        {answer ? (
          <div style={{ marginTop: 20, padding: 22, borderRadius: 28, background: "rgba(255,248,236,.1)", border: "1.5px solid rgba(255,248,236,.18)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", color: "var(--marigold)" }}>{answer.intent.toUpperCase()}</div>
            <div style={{ marginTop: 10, fontSize: 20, fontWeight: 700, lineHeight: 1.5, fontFamily: font }}>{answer.answer}</div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} style={{ minHeight: 58, borderRadius: 22, background: "rgba(255,248,236,.08)", border: "1.5px solid rgba(255,248,236,.18)", color: "var(--on-dark)", fontSize: 15.5, fontWeight: 700, fontFamily: font }}>
              {s}
            </button>
          ))}
        </div>

        <button type="button" onClick={listen} style={{ marginTop: "auto", height: 74, borderRadius: 999, background: "var(--marigold)", color: "var(--amber-text-3)", fontSize: 17, fontWeight: 800, fontFamily: font }}>
          🎙 {listening ? t("stopListening") : t("askAgain")}
        </button>
      </ScreenBody>
    </div>
  );
}

function Waveform({ on }: { on: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, height: 104, marginTop: 26, padding: "0 6px", borderRadius: 999 }}>
      {Array.from({ length: 26 }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: "100%", borderRadius: 999,
          background: i % 4 === 0 ? "var(--marigold)" : "rgba(255,248,236,.55)",
          transformOrigin: "center",
          transform: on ? undefined : "scaleY(.22)",
          animation: on ? `sk-wave ${(0.7 + (i % 5) * 0.12).toFixed(2)}s ease-in-out ${(i * 0.05).toFixed(2)}s infinite` : "none",
        }} />
      ))}
    </div>
  );
}
