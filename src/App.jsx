import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreProvider } from "./store/StoreContext";
import { UIProvider } from "./components/UIContext";
import AppShell from "./components/AppShell";
// Landing page is parked for now (src/pages/Landing.jsx is kept, just not routed).
import { Login, Register, DemoLink } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Pets from "./pages/Pets";
import PetDetail from "./pages/PetDetail";
import Profile from "./pages/Profile";
import Appointments from "./pages/Appointments";
import Emergency, { EmergencyGuide } from "./pages/Emergency";
import Breeds, { BreedDetail } from "./pages/Breeds";
import Assistant from "./pages/Assistant";

// HashRouter keeps deep links working on any static host without rewrite rules.
export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <UIProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/demo" element={<DemoLink />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="pets" element={<Pets />} />
              <Route path="pets/:id" element={<PetDetail />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="emergency" element={<Emergency />} />
              <Route path="emergency/:slug" element={<EmergencyGuide />} />
              <Route path="breeds" element={<Breeds />} />
              <Route path="breeds/:slug" element={<BreedDetail />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </UIProvider>
      </HashRouter>
    </StoreProvider>
  );
}
