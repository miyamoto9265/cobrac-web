// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const amplify = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("aws-amplify/auth", () => ({
  ...amplify,
  confirmResetPassword: vi.fn(),
  confirmSignUp: vi.fn(),
  fetchAuthSession: vi.fn(),
  resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock("aws-amplify", () => ({ Amplify: { configure: vi.fn() } }));
vi.mock("../src/lib/api", () => ({ api: { me: vi.fn(async () => null) }, ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { AuthProvider, useAuth } = await import("../src/lib/auth");
const { LoginPage } = await import("../src/pages/LoginPage");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <AuthProvider>{node}</AuthProvider>
      </I18nProvider>,
    );
  });
}

function SignedIn({ children }: { children: ReactNode }) {
  return useAuth().signedIn ? <div data-testid="home" /> : <>{children}</>;
}

async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = () =>
  act(async () => {
    document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  });
const emailInput = () => document.querySelector<HTMLInputElement>('input[type="email"]')!;
const passwordInput = () => document.querySelector<HTMLInputElement>('input[type="password"]')!;

beforeEach(() => {
  vi.clearAllMocks();
  amplify.getCurrentUser.mockRejectedValue(new Error("not signed in"));
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("first sign-in of an admin-created user", () => {
  it.each([
    ["ja", "初回ログイン", "パスワードを設定してログイン", "新しいパスワード（10文字以上）"],
    ["en", "First sign-in", "Set password and sign in", "New password (10+ characters)"],
  ])("asks for a new password, sends it as the challenge response and signs in (%s)", async (locale, title, submitLabel, placeholder) => {
    localStorage.setItem("cobrac-locale", locale);
    amplify.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" } });
    amplify.confirmSignIn.mockImplementation(async () => {
      amplify.getCurrentUser.mockResolvedValue({ signInDetails: { loginId: "taro@example.com" } });
      return { isSignedIn: true, nextStep: { signInStep: "DONE" } };
    });
    await render(
      <SignedIn>
        <LoginPage />
      </SignedIn>,
    );

    await type(emailInput(), "taro@example.com");
    await type(passwordInput(), "Tmp-7kQ2vX9p");
    await submit();

    expect(amplify.signIn).toHaveBeenCalledWith({ username: "taro@example.com", password: "Tmp-7kQ2vX9p" });
    expect(document.body.textContent).toContain(title);
    expect(document.body.textContent).not.toContain("Additional sign-in step required");
    expect(passwordInput().value).toBe("");
    expect(passwordInput().placeholder).toBe(placeholder);
    expect(passwordInput().autocomplete).toBe("new-password");
    expect(emailInput().readOnly).toBe(true);
    expect(document.querySelector('button[type="submit"]')!.textContent).toBe(submitLabel);

    await type(passwordInput(), "newpassword1");
    await submit();

    expect(amplify.confirmSignIn).toHaveBeenCalledWith({ challengeResponse: "newpassword1" });
    expect(document.querySelector('[data-testid="home"]')).not.toBeNull();
  });

  it("shows Cognito's error and stays on the step when the new password is rejected", async () => {
    localStorage.setItem("cobrac-locale", "en");
    amplify.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" } });
    amplify.confirmSignIn.mockRejectedValue(new Error("Password does not conform to policy"));
    await render(<LoginPage />);

    await type(emailInput(), "taro@example.com");
    await type(passwordInput(), "Tmp-7kQ2vX9p");
    await submit();
    await type(passwordInput(), "short");
    await submit();

    expect(document.body.textContent).toContain("Password does not conform to policy");
    expect(document.querySelector('button[type="submit"]')!.textContent).toBe("Set password and sign in");
  });
});
