import jwt from "jsonwebtoken";

const generateAccessToken = (userId) => {
  const secret = process.env.JWT_SECRET_ACCESS;
  if (!secret) {
    throw new Error(
      "JWT_SECRET_ACCESS is not set in environment variables. Add it (any long random string) to your .env / hosting platform's environment variables and restart the server."
    );
  }

  const token = jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRE || "5h",
  });

  return token;
};

export default generateAccessToken;
