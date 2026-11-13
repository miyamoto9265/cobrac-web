import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminOnly } from "./components/AdminOnly";
import { CanonicalProjectId } from "./components/CanonicalProjectId";
import { Layout } from "./components/Layout";
import { useT } from "./i18n";
import { useAuth } from "./lib/auth";
import { MISSIONS_PATH } from "./lib/plan";
import { pendingJoinToken, WorkspaceProvider } from "./lib/workspace";
import { JoinLanding } from "./pages/JoinPage";
import { LoginPage } from "./pages/LoginPage";

// Pages load on first visit, so the first screen does not wait for every page's code.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const AdminPage = page(() => import("./pages/AdminPage"), "AdminPage");
const ChatPage = page(() => import("./pages/ChatPage"), "ChatPage");
const ProjectWorkspacePage = page(() => import("./pages/ProjectWorkspacePage"), "ProjectWorkspacePage");
const LegacyChatRedirect = page(() => import("./pages/ProjectWorkspacePage"), "LegacyChatRedirect");
const ProjectsPage = page(() => import("./pages/ProjectsPage"), "ProjectsPage");
const CanonDetailPage = page(() => import("./pages/CanonDetailPage"), "CanonDetailPage");
const ExplorePage = page(() => import("./pages/ExplorePage"), "ExplorePage");
const PublicCanonPage = page(() => import("./pages/PublicCanonPage"), "PublicCanonPage");
const PublicProjectPage = page(() => import("./pages/PublicProjectPage"), "PublicProjectPage");
const CanonPullPage = page(() => import("./pages/CanonPullPage"), "CanonPullPage");
const ManualPage = page(() => import("./pages/ManualPage"), "ManualPage");
const PlanDetailPage = page(() => import("./pages/PlanDetailPage"), "PlanDetailPage");
const MissionBoard = page(() => import("./pages/PlansPage"), "MissionBoard");
const CanonList = page(() => import("./pages/CanonsPage"), "CanonList");
const NewPlanPage = page(() => import("./pages/PlansPage"), "NewPlanPage");
const ReleaseNotesPage = page(() => import("./pages/ReleaseNotesPage"), "ReleaseNotesPage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const SpecPage = page(() => import("./pages/SpecPage"), "SpecPage");
const TeamPage = page(() => import("./pages/TeamPage"), "TeamPage");
const JoinPage = page(() => import("./pages/JoinPage"), "JoinPage");

export default function App() {
  const { ready, signedIn } = useAuth();
  const t = useT();
  const loading = (
    <div className="flex h-full items-center justify-center text-slate-500">
      <div className="animate-pulse">{t("loading")}</div>
    </div>
  );
  if (!ready) return loading;
  if (!signedIn) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* an invite link: the team's name, then sign-in (the join page opens again after it) */}
        <Route path="/join/:token" element={<JoinLanding />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  const joinToken = pendingJoinToken();
  return (
    <WorkspaceProvider>
    <Suspense fallback={loading}>
    <Routes>
      <Route path="/join/:token" element={<JoinPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/login" element={<Navigate to={joinToken ? `/join/${encodeURIComponent(joinToken)}` : "/chat"} replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:projectId" element={<LegacyChatRedirect />} />
        <Route path="/projects" element={<ProjectsPage />} />
        {/* the missions (what waits on the owner first) and the Canons they build each have a list */}
        <Route path="/missions" element={<MissionBoard />} />
        <Route path="/plans" element={<Navigate to={MISSIONS_PATH} replace />} />
        <Route path="/plans/new" element={<NewPlanPage />} />
        <Route path="/plans/:planId/:view?" element={<PlanDetailPage />} />
        <Route path="/canons" element={<CanonList />} />
        <Route path="/canons/:canonId/:view?" element={<CanonDetailPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/projects/:projectId" element={<PublicProjectPage />} />
        <Route path="/explore/canons/:canonId" element={<PublicCanonPage />} />
        <Route path="/canons/:canonId/pulls/:no" element={<CanonPullPage />} />
        <Route path="/projects/:projectId/:view?" element={<CanonicalProjectId><ProjectWorkspacePage /></CanonicalProjectId>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/teams/:teamId" element={<TeamPage />} />
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
    </Suspense>
    </WorkspaceProvider>
  );
}
