import { useState } from "react";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar } from "../ui";
import { CropChips, PricesPanel, AlertsPanel, TransportPanel } from "./Rates";
import { BoardPanel } from "./Listings";

const SUB_TABS = [
  { key: "prices", label: "marketPrices" },
  { key: "transport", label: "marketTransport" },
  { key: "alerts", label: "marketAlerts" },
  { key: "board", label: "marketBoard" },
] as const;
type SubTab = (typeof SUB_TABS)[number]["key"];

/**
 * Market — the farmer's "produce + price" home: live rates, the transport
 * calculator, price alerts, and the listing board, as one screen with
 * sub-tabs instead of four separate primary nav destinations. The Board
 * sub-tab has its own crop filter (browsing listings); the other three
 * share one crop selector, since they all price the same crop.
 */
export function Market() {
  const { t, font } = useI18n();
  const [sub, setSub] = useState<SubTab>("prices");
  const [crop, setCrop] = useState("Wheat");

  return (
    <>
      <StatusBar right={t("tabMarket")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {SUB_TABS.map((s) => (
              <button key={s.key} type="button" onClick={() => setSub(s.key)}
                style={{ flex: 1, minHeight: 42, borderRadius: 14, border: 0, background: sub === s.key ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: sub === s.key ? "#fff" : "var(--muted)", fontSize: 11.5, fontWeight: 800, fontFamily: font }}>
                {t(s.label)}
              </button>
            ))}
          </div>

          {sub !== "board" && <CropChips crop={crop} onCrop={setCrop} font={font} />}

          <div className="fade-in" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {sub === "prices" && <PricesPanel crop={crop} />}
            {sub === "transport" && <TransportPanel crop={crop} />}
            {sub === "alerts" && <AlertsPanel crop={crop} />}
            {sub === "board" && <BoardPanel />}
          </div>
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}
