import { Component, type ReactNode } from "react";
import { useI18n } from "./i18n/context";

function ErrorFallback() {
  const { t } = useI18n();
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "20px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t("errorRetry")}</div>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, maxWidth: 300 }}>
          {t("appName")} encountered an unexpected error. Please try refreshing the page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: "12px 28px", borderRadius: 999, background: "var(--green-ink)", color: "var(--on-dark)", fontWeight: 700, fontSize: 15, border: 0, cursor: "pointer" }}
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
