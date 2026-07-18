import mongoose from "mongoose";

// This exact host belonged to the demo connection string shipped in the
// example .env for earlier phases of this project. If a deployment is still
// pointed at it, every database operation (including login/register) will
// either fail outright or silently hang depending on the demo cluster's
// current state — flag it loudly instead of a confusing generic error.
const SHIPPED_PLACEHOLDER_HOST = "deepseek.9vclkwv.mongodb.net";

const connectDb = async () => {
  const uri = process.env.MONGODB_URI || "";

  if (!uri) {
    console.error(
      "\n✖ MONGODB_URI is not set in your .env file. Add your own MongoDB connection string and restart.\n"
    );
    process.exit(1);
  }

  if (uri.includes(SHIPPED_PLACEHOLDER_HOST)) {
    console.warn(
      "\n⚠ MONGODB_URI is still the placeholder demo connection string from the project template.\n" +
      "  This is not your database — replace MONGODB_URI in .env with your own MongoDB Atlas\n" +
      "  (or local) connection string. Until then, login/register/checkout and every other\n" +
      "  database-backed feature will fail.\n"
    );
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // fail fast with a clear error instead of hanging
    });
    console.log(`✓ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(
      `\n✖ MongoDB connection failed: ${error.message}\n` +
      "  Check that MONGODB_URI in .env is correct, the cluster is running, and your current\n" +
      "  IP address is allowed in your MongoDB Atlas Network Access settings.\n"
    );
    process.exit(1);
  }
};

export default connectDb;
