/**
 * Generates a 6-digit numeric OTP as a string
 * @returns {string}
 */
const generateOtp = () => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  return otp.toString();
};

export default generateOtp;
