import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { PhoneFrame } from "./ui";
import { Login } from "./screens/Login";
import { Home } from "./screens/Home";
import { Queue } from "./screens/Queue";
import { Book } from "./screens/Book";
import { Rates } from "./screens/Rates";
import { Alerts } from "./screens/Alerts";
import { Voice } from "./screens/Voice";
import { Records } from "./screens/Records";
import { AdminApp } from "./admin/AdminApp";

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
  if (loc.pathname.startsWith("/admin")) return <AdminApp />;

  return (
    <PhoneFrame>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/queue" element={<RequireAuth><Queue /></RequireAuth>} />
        <Route path="/book" element={<RequireAuth><Book /></RequireAuth>} />
        <Route path="/rates" element={<RequireAuth><Rates /></RequireAuth>} />
        <Route path="/alerts" element={<RequireAuth><Alerts /></RequireAuth>} />
        <Route path="/voice" element={<RequireAuth><Voice /></RequireAuth>} />
        <Route path="/records" element={<RequireAuth><Records /></RequireAuth>} />
        <Route path="*" element={<Navigate to={api.isAuthed() ? "/home" : "/login"} replace />} />
      </Routes>
    </PhoneFrame>
  );
}
