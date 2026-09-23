import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

// Catch the install prompt early, before the app shell mounts its button.
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__furfriendsInstall = e; });

registerSW({ immediate: true });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
