import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { log } from "@/lib/logger";
import "./index.css";

log.info("CloudWrkz web app starting", { env: import.meta.env.MODE });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
