import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { uploadImageController } from "@/server/controllers/uploadImage.controller";

// Force the Node.js runtime (not Edge) — we rely on Buffer and need a
// generous body size limit for camera-original photo uploads.
export const runtime = "nodejs";
export const maxDuration = 60;

// Multer is not used here — multipart/form-data is parsed natively by
// apiHandler.js (buildMockRequest) and the file buffer is placed in req.file.
const ROUTES = {
  "POST:/upload": [[auth], uploadImageController],
};

// Fix 3: without this, Next.js can statically cache this route's
// GET responses (the actual DB-reading logic lives in the shared
// apiHandler.js helper, not directly in this file, so Next's static
// analyzer doesn't reliably detect it as dynamic on its own) — which
// is exactly why order counts / dashboards could show stale data
// instead of the latest DB state. Forcing dynamic rendering makes
// every request hit the database fresh, every time.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
