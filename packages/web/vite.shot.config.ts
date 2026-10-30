import base from "./vite.config";
import { mergeConfig } from "vite";
const S = "/tmp/claude-0/-home-user/4715fdbd-b443-569f-a1d0-4e49c8da7a20/scratchpad/shot";
export default mergeConfig(base, {
  root: "/home/user/cobrac-web/packages/web",
  resolve: { alias: [
    { find: /^aws-amplify\/auth$/, replacement: S + "/amplify-auth-stub.ts" },
    { find: /^aws-amplify$/, replacement: S + "/amplify-stub.ts" },
  ] },
  server: { port: 5199, fs: { allow: ["/"] } },
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://localhost:5199/mockapi") },
});
