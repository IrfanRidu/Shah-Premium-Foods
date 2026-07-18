import { Resend } from "resend";

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
