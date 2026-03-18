import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { log } from "@/lib/logger";
import "./index.css";

log.info("CloudWrkz web app starting", { env: import.meta.env.MODE });

// In dev, log failures that often show as "Load failed" in the UI but nothing in console
if (import.meta.env.DEV) {
  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason?.message ?? String(event.reason);
    if (
      typeof msg === "string" &&
      (msg.includes("Load failed") || msg.includes("Failed to fetch") || msg.includes("NetworkError"))
    ) {
      log.error("Unhandled network/load failure", {
        message: msg,
        reason: event.reason,
      });
    }
  });
  window.addEventListener("error", (event) => {
    const m = event.message ?? "";
    const isLoadError =
      m.includes("Load failed") ||
      m.includes("Loading chunk") ||
      m.includes("Failed to fetch") ||
      m.includes("Importing a module script failed");
    if (isLoadError) {
      log.error("Resource or script load error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
      });
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
