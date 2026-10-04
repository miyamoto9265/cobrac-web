import type { CustomMessageTriggerEvent } from "aws-lambda";
import { pickLangs, renderAuthEmail, type AuthEmailKind } from "../lib/authEmails.js";

const KINDS: Partial<Record<CustomMessageTriggerEvent["triggerSource"], AuthEmailKind>> = {
  CustomMessage_SignUp: "signUp",
  CustomMessage_ResendCode: "resendCode",
  CustomMessage_ForgotPassword: "forgotPassword",
  CustomMessage_UpdateUserAttribute: "updateEmail",
  CustomMessage_VerifyUserAttribute: "updateEmail",
  CustomMessage_AdminCreateUser: "adminInvite",
};

/** Cognito custom message trigger: replaces the default account e-mails. Other sources keep Cognito's message. */
export const handler = async (event: CustomMessageTriggerEvent): Promise<CustomMessageTriggerEvent> => {
  const kind = KINDS[event.triggerSource];
  if (!kind) return event;
  const mail = renderAuthEmail({
    kind,
    langs: pickLangs(event.request.clientMetadata?.lang, event.request.userAttributes?.locale),
    siteUrl: process.env.SITE_URL ?? "",
    codeParameter: event.request.codeParameter,
    usernameParameter: event.request.usernameParameter ?? undefined,
  });
  event.response.emailSubject = mail.subject;
  event.response.emailMessage = mail.html;
  return event;
};
