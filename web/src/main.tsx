import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "./i18n/context";
import { ToastProvider } from "./ui";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./theme.css";
import "./app.css";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

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
