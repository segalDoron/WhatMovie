import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GeminiKeyHelp from "./GeminiKeyHelp";
import "./styles.css";
import "./help.css";

// Same theme as the app: the saved choice, otherwise the device setting.
const saved = localStorage.getItem("theme");
document.documentElement.dataset.theme = saved ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GeminiKeyHelp />
  </StrictMode>
);
