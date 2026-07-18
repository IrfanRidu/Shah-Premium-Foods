import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import {
  listNotificationsController,
  markNotificationReadController,
  markAllNotificationsReadController,
} from "@/server/controllers/notification.controller";

const ROUTES = {
  "GET:/list":          [[auth], listNotificationsController],
  "PUT:/mark-read":     [[auth], markNotificationReadController],
  "PUT:/mark-all-read": [[auth], markAllNotificationsReadController],
};

export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
