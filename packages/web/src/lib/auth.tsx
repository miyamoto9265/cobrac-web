import { Amplify } from "aws-amplify";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "aws-amplify/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserPublic } from "@cobrac/shared";
import { api } from "./api";
import type { RuntimeConfig } from "./config";

interface AuthState {
  ready: boolean;
  signedIn: boolean;
  email: string | null;
  me: UserPublic | null;
  refreshMe: () => Promise<void>;
  doSignIn: (email: string, password: string) => Promise<void>;
  doSignUp: (email: string, password: string) => Promise<"confirm" | "done">;
  doConfirmSignUp: (email: string, code: string) => Promise<void>;
  doResendCode: (email: string) => Promise<void>;
  doResetPassword: (email: string) => Promise<void>;
  doConfirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  doUpdatePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  doSignOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function configureAmplify(cfg: RuntimeConfig) {
  Amplify.configure({
    Auth: { Cognito: { userPoolId: cfg.userPoolId, userPoolClientId: cfg.userPoolClientId } },
  });
}

export async function getIdToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [me, setMe] = useState<UserPublic | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      setMe(null);
    }
  }, []);

  const check = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setSignedIn(true);
      setEmail(u.signInDetails?.loginId ?? null);
      await refreshMe();
    } catch {
      setSignedIn(false);
      setEmail(null);
      setMe(null);
    } finally {
      setReady(true);
    }
  }, [refreshMe]);

  useEffect(() => {
    void check();
  }, [check]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      signedIn,
      email,
      me,
      refreshMe,
      doSignIn: async (e, p) => {
        const r = await signIn({ username: e, password: p });
        if (r.nextStep.signInStep === "CONFIRM_SIGN_UP") throw new Error("CONFIRM_SIGN_UP");
        if (!r.isSignedIn) throw new Error(`追加ステップが必要です: ${r.nextStep.signInStep}`);
        await check();
      },
      doSignUp: async (e, p) => {
        const r = await signUp({ username: e, password: p, options: { userAttributes: { email: e } } });
        return r.nextStep.signUpStep === "CONFIRM_SIGN_UP" ? "confirm" : "done";
      },
      doConfirmSignUp: async (e, code) => {
        await confirmSignUp({ username: e, confirmationCode: code });
      },
      doResendCode: async (e) => {
        await resendSignUpCode({ username: e });
      },
      doResetPassword: async (e) => {
        await resetPassword({ username: e });
      },
      doConfirmResetPassword: async (e, code, np) => {
        await confirmResetPassword({ username: e, confirmationCode: code, newPassword: np });
      },
      doUpdatePassword: async (o, n) => {
        await updatePassword({ oldPassword: o, newPassword: n });
      },
      doSignOut: async () => {
        await signOut();
        await check();
      },
    }),
    [ready, signedIn, email, me, refreshMe, check],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
