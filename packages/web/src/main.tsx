import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { I18nProvider } from "./i18n";
import { AuthProvider, configureAmplify } from "./lib/auth";
import { loadConfig } from "./lib/config";
import { ThemeProvider } from "./lib/theme";

async function bootstrap() {
  const cfg = await loadConfig();
  configureAmplify(cfg);
  document.title = cfg.appName;
  document.documentElement.lang = "en";
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <I18nProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </I18nProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
