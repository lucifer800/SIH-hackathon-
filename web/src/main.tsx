import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "./i18n/context";
import { ToastProvider } from "./ui";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./theme.css";
import "./app.css";

// Dev-mode module URLs are hash-versioned and change on every server restart,
// which a service worker's cache-first strategy fights with directly — a
// stale cached chunk alongside a fresh one produces a duplicate React runtime
// ("Cannot read properties of null (reading 'useState')") that no server-side
// fix can resolve, since the browser stops hitting the dev server at all.
// Only register in a real (production) build; in dev, clean up any service
// worker + cache a previous visit may have installed.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js");
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <I18nProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </I18nProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
