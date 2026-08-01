const loginOtpTemplate = ({ name, otp }) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #16a34a;">Shah Premium Foods</h2>
    <p>Hi ${name},</p>
    <p>Someone is trying to sign in to your account. Use the code below to complete sign-in:</p>
    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 6px; margin: 16px 0;">
      ${otp}
    </div>
    <p>This code is valid for 10 minutes. If this wasn't you, someone may have your password — we'd recommend changing it as soon as possible and this sign-in attempt will not succeed without the code above.</p>
    <hr style="margin-top: 24px;" />
    <p style="font-size: 12px; color: #777;">&copy; ${new Date().getFullYear()} Shah Premium Foods. All rights reserved.</p>
  </div>
  `;
};

export default loginOtpTemplate;
