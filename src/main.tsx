import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import App from "./App";
import { initI18n, t } from "./i18n";
import "./index.css";

setWorkerUrl(workerUrl);

initI18n();
document.title = t("app.title");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
