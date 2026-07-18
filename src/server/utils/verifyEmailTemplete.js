const verifyEmailTemplate = ({ name, otp }) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #16a34a;">Shah Premium Foods</h2>
    <p>Hi ${name},</p>
    <p>Thank you for registering with Shah Premium Foods. Enter this code to verify your email address:</p>
    <div style="text-align: center; margin: 24px 0;">
      <span style="display: inline-block; padding: 14px 28px; background-color: #16a34a; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 6px; border-radius: 8px;">
        ${otp}
      </span>
    </div>
    <p>This code expires in 1 hour. If you did not create an account, please ignore this email.</p>
    <hr style="margin-top: 24px;" />
    <p style="font-size: 12px; color: #777;">&copy; ${new Date().getFullYear()} Shah Premium Foods. All rights reserved.</p>
  </div>
  `;
};

export default verifyEmailTemplate;
