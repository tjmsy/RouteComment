import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initI18n, t } from "./i18n";
import "./index.css";

initI18n();
document.title = t("app.title");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
