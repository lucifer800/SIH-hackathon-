import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n/context";
import { LangChips, StatusBar, ScreenBody, useToast } from "../ui";

type Step = "mobile" | "otp";

export function Login() {
  const { t, font } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);

  const digits = mobile.replace(/\D/g, "").slice(0, 10);

  async function sendCode() {
    if (digits.length !== 10) return toast(t("mobilePlaceholder"));
    setBusy(true);
    try {
      const res = await api.requestOtp("+91" + digits);
      setDevCode(res.devCode); // demo affordance — the real code arrives by SMS
      setStep("otp");
    } finally { setBusy(false); }
  }

  function press(d: string) {
    if (d === "clear") return setCode("");
    if (d === "speak") return toast(t("speak") + " — " + t("qTurn"));
    setCode((c) => (c.length < 4 ? c + d : c));
  }

  // Let the user type the OTP from their physical keyboard too
  useEffect(() => {
    if (step !== "otp") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); setCode((c) => (c.length < 4 ? c + e.key : c)); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); setCode((c) => c.slice(0, -1)); }
      else if (e.key === "Enter") { e.preventDefault(); document.querySelector<HTMLButtonElement>(".cta")?.click(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step]);

  async function verify() {
    if (code.length < 4) return toast(t("enterCode"));
    setBusy(true);
    try {
      await api.verifyOtp("+91" + digits, code);
      window.dispatchEvent(new Event("kq-auth"));
      nav("/home", { replace: true });
    } catch (e: any) {
      toast(e.message || "Try again");
      setCode("");
    } finally { setBusy(false); }
  }

  return (
    <>
      <StatusBar />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: 22, background: "var(--green-ink)", color: "var(--marigold)", fontFamily: "var(--font-pa)", fontSize: 30, fontWeight: 700 }}>ਕ</div>

          {step === "mobile" ? (
            <>
              <h2 className="h-display" style={{ margin: "24px 0 6px", fontSize: 33 }}>{t("appName")}</h2>
              <p style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>{t("enterMobile")}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 76, borderRadius: 22, border: "2.5px solid var(--line)", background: "#fff", padding: "0 20px" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--muted-2)" }}>+91</span>
                <input
                  inputMode="numeric" autoFocus value={digits}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder={t("mobilePlaceholder")}
                  style={{ flex: 1, border: 0, outline: 0, background: "transparent", fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: ".04em", color: "var(--green-ink)", minWidth: 0 }}
                />
              </div>
              <div style={{ marginTop: "auto", display: "grid", gap: 16, paddingTop: 24 }}>
                <LangChips />
                <button type="button" className="cta" disabled={busy} onClick={sendCode}>
                  {busy ? <span className="spinner" /> : t("sendCode")}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="h-display" style={{ margin: "24px 0 8px", fontSize: 33 }}>{t("enterCode")}</h2>
              <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>
                {t("codeSentTo")} +91 {digits}
              </p>
              {devCode ? <p style={{ margin: "0 0 16px", fontSize: 12.5, fontWeight: 800, color: "var(--terra)" }}>demo code: {devCode}</p> : null}

              <div style={{ display: "flex", gap: 12, margin: "16px 0 10px" }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ flex: 1, height: 76, borderRadius: 22, border: "2.5px solid var(--line)", background: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 600 }}>
                    {code[i] ?? ""}
                  </div>
                ))}
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 13.5, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>
                {code.length < 4 ? `${code.length} ${t("ofEntered")} 4` : t("codeComplete")}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button key={d} type="button" onClick={() => press(d)} style={keyStyle}>{d}</button>
                ))}
                <button type="button" onClick={() => press("speak")} style={{ ...keyStyle, background: "var(--amber-soft)", color: "var(--amber-text)", fontSize: 13, fontWeight: 800 }}>{t("speak")}</button>
                <button type="button" onClick={() => press("0")} style={keyStyle}>0</button>
                <button type="button" onClick={() => press("clear")} style={{ ...keyStyle, background: "rgba(30,59,35,.08)", fontSize: 13, fontWeight: 800 }}>{t("clear")}</button>
              </div>

              <button type="button" className="cta" style={{ marginTop: 16 }} disabled={busy} onClick={verify}>
                {busy ? <span className="spinner" /> : t("verify")}
              </button>
              <button type="button" onClick={() => { setStep("mobile"); setCode(""); }} style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>
                {t("changeNumber")}
              </button>
            </>
          )}
        </div>
      </ScreenBody>
    </>
  );
}

const keyStyle: React.CSSProperties = {
  minHeight: 62, borderRadius: 20, background: "#fff", boxShadow: "0 4px 12px rgba(30,59,35,.07)",
  fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--green-ink)",
};
