import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useI18n } from "./i18n/context";

/* ---------------------------------------------------------------- phone shell */
/* On a phone the app is full-bleed. On desktop it sits inside the Sunrise phone
   frame so the demo looks like the handoff. */

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="stage">
      <div className="phone">
        <div className="screen">{children}</div>
      </div>
    </div>
  );
}

/** Live IST clock — real Delhi time, 24-hour, refreshed each minute. */
function useIstClock() {
  const fmt = () =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 15_000); // catches the minute rollover
    return () => clearInterval(id);
  }, []);
  return time;
}

export function StatusBar({ right }: { right?: string }) {
  const time = useIstClock();
  return (
    <div className="statusbar">
      <span>{time}</span>
      <span className="statusbar-right">
        {right ? <span className="statusbar-live">{right}</span> : null}
        <span className="dot" /><span className="dot" />
        <span className="battery" />
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- bottom tabs */

const TABS = [
  { to: "/home", key: "tabHome" },
  { to: "/book", key: "tabBook" },
  { to: "/rates", key: "tabRates" },
  { to: "/alerts", key: "tabAlerts" },
] as const;

export function TabBar({ unread = 0 }: { unread?: number }) {
  const { t } = useI18n();
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => "tab" + (isActive ? " tab-active" : "")}>
          {t(tab.key)}
          {tab.key === "tabAlerts" && unread > 0 ? <span className="tab-badge">{unread}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------------- toast */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const timer = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(""), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={"toast" + (msg ? " toast-show" : "")} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- language chips */

export function LangChips({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const langs: { code: "pa" | "hi" | "en"; label: string; font: string }[] = [
    { code: "pa", label: "ਪੰਜਾਬੀ", font: "var(--font-pa)" },
    { code: "hi", label: "हिन्दी", font: "var(--font-hi)" },
    { code: "en", label: "English", font: "var(--font-ui)" },
  ];
  return (
    <div className={"langchips" + (compact ? " langchips-compact" : "")}>
      {langs.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          style={{ fontFamily: l.font }}
          className={"langchip" + (lang === l.code ? " langchip-on" : "")}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- scroll body */

export function ScreenBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="screen-body" style={style}>{children}</div>;
}

export const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
