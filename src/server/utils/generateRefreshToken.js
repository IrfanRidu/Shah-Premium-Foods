import jwt from "jsonwebtoken";
import UserModel from "../models/user.model.js";

const generateRefreshToken = async (userId) => {
  const secret = process.env.JWT_SECRET_REFRESH;
  if (!secret) {
    throw new Error(
      "JWT_SECRET_REFRESH is not set in environment variables. Add it (any long random string, different from JWT_SECRET_ACCESS) to your .env / hosting platform's environment variables and restart the server."
    );
  }

  const token = jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d",
  });

  await UserModel.updateOne({ _id: userId }, { refresh_token: token });

  return token;
};

export default generateRefreshToken;
