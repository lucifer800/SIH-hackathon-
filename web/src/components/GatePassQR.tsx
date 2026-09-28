import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Full-screen gate-pass overlay: a QR code encoding `ref|gateOtp`, the same
 * pair the manual entry form already sends to POST /op/checkin. The operator
 * scans it instead of typing the 4-digit code — no backend change, this is
 * purely a faster way to fill in the same two fields.
 */
export function encodeGatePass(ref: string, gateOtp: string) {
  return `${ref}|${gateOtp}`;
}

export function GatePassOverlay({ bookingRef, gateOtp, onClose, t, font }: {
  bookingRef: string; gateOtp: string; onClose: () => void; t: (k: string) => string; font: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, encodeGatePass(bookingRef, gateOtp), { width: 240, margin: 1, color: { dark: "#1E3B23", light: "#FFFFFF" } })
      .catch(() => setError(true));
  }, [bookingRef, gateOtp]);

  return (
    <div
      role="button" tabIndex={0} onClick={onClose} onKeyDown={(e) => e.key === "Enter" && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,26,17,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ background: "#fff", borderRadius: 32, padding: "32px 28px", maxWidth: 320, width: "100%", textAlign: "center" }}>
        {error ? (
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 4, color: "var(--green-ink)", padding: "24px 0" }}>{gateOtp}</div>
        ) : (
          <canvas ref={canvasRef} style={{ width: 240, height: 240, maxWidth: "100%" }} />
        )}
        <div className="h-display" style={{ marginTop: 16, fontSize: 22, letterSpacing: 4, color: "var(--green-ink)" }}>{gateOtp}</div>
        <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>{t("scanAtGate")}</div>
        <div style={{ marginTop: 18, fontSize: 12.5, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>{t("tapToClose")}</div>
      </div>
    </div>
  );
}
