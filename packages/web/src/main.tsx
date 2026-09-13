import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { AuthProvider, configureAmplify } from "./lib/auth";
import { loadConfig } from "./lib/config";

async function bootstrap() {
  const cfg = await loadConfig();
  configureAmplify(cfg);
  document.title = cfg.appName;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
