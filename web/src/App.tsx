import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { PhoneFrame } from "./ui";
import { Login } from "./screens/Login";
import { Home } from "./screens/Home";

const Queue = lazy(() => import("./screens/Queue").then(m => ({ default: m.Queue })));
const Book = lazy(() => import("./screens/Book").then(m => ({ default: m.Book })));
const Rates = lazy(() => import("./screens/Rates").then(m => ({ default: m.Rates })));
const Alerts = lazy(() => import("./screens/Alerts").then(m => ({ default: m.Alerts })));
const Voice = lazy(() => import("./screens/Voice").then(m => ({ default: m.Voice })));
const Records = lazy(() => import("./screens/Records").then(m => ({ default: m.Records })));

const AdminApp = lazy(() => import("./admin/AdminApp").then(m => ({ default: m.AdminApp })));

function RequireAuth({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  if (!api.isAuthed()) return <Navigate to="/login" replace state={{ from: loc }} />;
  return children;
}

export function App() {
  const loc = useLocation();
  // Re-render on auth change (login / logout navigate, so a key on location works).
  const [, setTick] = useState(0);
  useEffect(() => {
    const onStorage = () => setTick((t) => t + 1);
    window.addEventListener("kq-auth", onStorage);
    return () => window.removeEventListener("kq-auth", onStorage);
  }, []);

  // The admin console is a desktop surface, not a phone screen — it renders
  // full-width, outside the Sunrise PhoneFrame the farmer app lives in.
  if (loc.pathname.startsWith("/admin")) return <Suspense fallback={<div />}><AdminApp /></Suspense>;

  return (
    <PhoneFrame>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/queue" element={<RequireAuth><Suspense fallback={<div />}><Queue /></Suspense></RequireAuth>} />
        <Route path="/book" element={<RequireAuth><Suspense fallback={<div />}><Book /></Suspense></RequireAuth>} />
        <Route path="/rates" element={<RequireAuth><Suspense fallback={<div />}><Rates /></Suspense></RequireAuth>} />
        <Route path="/alerts" element={<RequireAuth><Suspense fallback={<div />}><Alerts /></Suspense></RequireAuth>} />
        <Route path="/voice" element={<RequireAuth><Suspense fallback={<div />}><Voice /></Suspense></RequireAuth>} />
        <Route path="/records" element={<RequireAuth><Suspense fallback={<div />}><Records /></Suspense></RequireAuth>} />
        <Route path="*" element={<Navigate to={api.isAuthed() ? "/home" : "/login"} replace />} />
      </Routes>
    </PhoneFrame>
  );
}
