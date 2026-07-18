const forgotPasswordTemplate = ({ name, otp }) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #16a34a;">Shah Premium Foods</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset your password. Use the OTP below to proceed:</p>
    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 6px; margin: 16px 0;">
      ${otp}
    </div>
    <p>This OTP is valid for 1 hour. If you did not request a password reset, please ignore this email.</p>
    <hr style="margin-top: 24px;" />
    <p style="font-size: 12px; color: #777;">&copy; ${new Date().getFullYear()} Shah Premium Foods. All rights reserved.</p>
  </div>
  `;
};

export default forgotPasswordTemplate;
