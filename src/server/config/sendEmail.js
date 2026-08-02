import { Resend } from "resend";
import { errorLogger } from "@/lib/logger";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

/**
 * Send an email using Resend
 * @param {Object} param0
 * @param {string} param0.sendTo - Recipient email
 * @param {string} param0.subject - Email subject
 * @param {string} param0.html - Email HTML body
 */
const sendEmail = async ({ sendTo, subject, html }) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      // QA pass finding: this used to unconditionally console.log the full
      // email — including things like password-reset links, which carry a
      // secret token — and return success:true regardless of environment.
      // That's a reasonable dev convenience (lets a developer without a
      // real email provider configured still read a reset link straight
      // from their own terminal), but with no production guard it meant a
      // misconfigured deployment (RESEND_API_KEY missing) would silently
      // "succeed" at sending zero real emails while writing security-
      // sensitive content to server logs, with nothing in the response to
      // reveal that anything was wrong. Split the behavior: production
      // fails loudly (through the same structured error logger the rest of
      // the app uses) and reports a real failure so callers can react;
      // local development keeps the original console convenience.
      if (process.env.NODE_ENV === "production") {
        errorLogger.error("sendEmail: RESEND_API_KEY is not set in production — email not sent", { sendTo, subject });
        return { success: false, error: "Email service is not configured (RESEND_API_KEY missing)." };
      }
      console.warn(
        "RESEND_API_KEY is not set. Skipping email send (dev mode). Email content below:"
      );
      console.log({ sendTo, subject, html });
      return { success: true, skipped: true };
    }

    const { data, error } = await resend.emails.send({
      from: `Shah Premium Foods <${process.env.RESEND_FROM_EMAIL}>`,
      to: sendTo,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("sendEmail error:", error.message);
    return { success: false, error: error.message };
  }
};

export default sendEmail;
