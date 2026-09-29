import { Navigate, Route, Routes } from "react-router-dom";
import { CanonicalProjectId } from "./components/CanonicalProjectId";
import { Layout } from "./components/Layout";
import { useT } from "./i18n";
import { useAuth } from "./lib/auth";
import { AdminPage } from "./pages/AdminPage";
import { ChatPage } from "./pages/ChatPage";
import { DocsPage } from "./pages/DocsPage";
import { LoginPage } from "./pages/LoginPage";
import { LegacyChatRedirect, ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { CanonsPage } from "./pages/CanonsPage";
import { CanonDetailPage } from "./pages/CanonDetailPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const { ready, signedIn } = useAuth();
  const t = useT();
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <div className="animate-pulse">{t("loading")}</div>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/login" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:projectId" element={<LegacyChatRedirect />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/canons" element={<CanonsPage />} />
        <Route path="/canons/:canonId" element={<CanonDetailPage />} />
        <Route path="/projects/:projectId/:view?" element={<CanonicalProjectId><ProjectWorkspacePage /></CanonicalProjectId>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:slug" element={<DocsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  );
}
