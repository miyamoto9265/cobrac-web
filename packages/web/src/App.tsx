import { Navigate, Route, Routes } from "react-router-dom";
import { AdminOnly } from "./components/AdminOnly";
import { CanonicalProjectId } from "./components/CanonicalProjectId";
import { Layout } from "./components/Layout";
import { useT } from "./i18n";
import { useAuth } from "./lib/auth";
import { AdminPage } from "./pages/AdminPage";
import { ChatPage } from "./pages/ChatPage";
import { LoginPage } from "./pages/LoginPage";
import { LegacyChatRedirect, ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { CanonsPage } from "./pages/CanonsPage";
import { CanonDetailPage } from "./pages/CanonDetailPage";
import { ExplorePage } from "./pages/ExplorePage";
import { PublicCanonPage } from "./pages/PublicCanonPage";
import { PublicProjectPage } from "./pages/PublicProjectPage";
import { CanonPullPage } from "./pages/CanonPullPage";
import { ManualPage } from "./pages/ManualPage";
import { PlanDetailPage } from "./pages/PlanDetailPage";
import { PlansPage } from "./pages/PlansPage";
import { ReleaseNotesPage } from "./pages/ReleaseNotesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SpecPage } from "./pages/SpecPage";

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
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/plans/:planId" element={<PlanDetailPage />} />
        <Route path="/canons" element={<CanonsPage />} />
        <Route path="/canons/:canonId" element={<CanonDetailPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/projects/:projectId" element={<PublicProjectPage />} />
        <Route path="/explore/canons/:canonId" element={<PublicCanonPage />} />
        <Route path="/canons/:canonId/pulls/:no" element={<CanonPullPage />} />
        <Route path="/projects/:projectId/:view?" element={<CanonicalProjectId><ProjectWorkspacePage /></CanonicalProjectId>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/manual" element={<ManualPage />} />
        <Route path="/releases" element={<ReleaseNotesPage />} />
        <Route path="/docs/CHANGELOG" element={<Navigate to="/releases" replace />} />
        <Route path="/docs" element={<AdminOnly fallback="/manual"><SpecPage /></AdminOnly>} />
        {/* the Markdown documents that used to live at /docs/<slug> are all in the specification PDF now */}
        <Route path="/docs/*" element={<Navigate to="/docs" replace />} />
        <Route path="/admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  );
}
