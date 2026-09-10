/** Small dashboard primitives for the admin console. Built on the Sunrise
 *  tokens in theme.css, laid out for a desktop screen instead of a phone. */
import { useSyncExternalStore, type ReactNode } from "react";
import { adminStore } from "./data";

/** Re-render whenever the store mutates. */
export function useAdmin() {
  useSyncExternalStore(adminStore.subscribe, adminStore.getVersion, adminStore.getVersion);
  return adminStore.get();
}

export const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ad-card">
      {(title || action) && (
        <header className="ad-card-head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={"ad-stat" + (tone ? " ad-stat-" + tone : "")}>
      <span className="ad-stat-label">{label}</span>
      <span className="ad-stat-value">{value}</span>
      {sub && <span className="ad-stat-sub">{sub}</span>}
    </div>
  );
}

const TONE: Record<string, string> = {
  open: "good", credited: "good", served: "good", resolved: "good", active: "good", delivered: "good",
  booked: "info", checked_in: "info", initiated: "info", acknowledged: "info", sent: "info",
  paused: "warn", pending: "warn", rescheduled: "warn", queued: "warn",
  closed: "bad", failed: "bad", returned: "bad", no_show: "bad", cancelled: "bad", rejected: "bad", open_grievance: "bad",
};

export function Badge({ children }: { children: string }) {
  const tone = TONE[children] ?? "info";
  return <span className={"ad-badge ad-badge-" + tone}>{children.replace(/_/g, " ")}</span>;
}

export interface Col<Row> { key: string; head: string; cell: (row: Row) => ReactNode; align?: "right"; }

export function Table<Row>({ cols, rows, empty = "Nothing here yet." }: { cols: Col<Row>[]; rows: Row[]; empty?: string }) {
  return (
    <div className="ad-tablewrap">
      <table className="ad-table">
        <thead>
          <tr>{cols.map((c) => <th key={c.key} className={c.align === "right" ? "r" : ""}>{c.head}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="ad-empty" colSpan={cols.length}>{empty}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>{cols.map((c) => <td key={c.key} className={c.align === "right" ? "r" : ""}>{c.cell(row)}</td>)}</tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function BtnRow({ children }: { children: ReactNode }) { return <div className="ad-btnrow">{children}</div>; }

export function Btn({ children, onClick, kind = "ghost", disabled }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean }) {
  return <button type="button" className={"ad-btn ad-btn-" + kind} onClick={onClick} disabled={disabled}>{children}</button>;
}
