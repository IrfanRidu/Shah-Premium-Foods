import { createNextHandler } from "@/lib/apiHandler";
import auth, { optionalAuth } from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  getQuestionsController,
  askQuestionController,
  answerQuestionController,
  toggleQuestionHelpfulController,
  deleteOwnQuestionController,
  adminDeleteQuestionController,
  adminModerateQuestionController,
} from "@/server/controllers/qa.controller";

const ROUTES = {
  "GET:/list":             [[optionalAuth], getQuestionsController],
  "POST:/ask":             [[auth], askQuestionController],
  "POST:/answer":          [[auth], answerQuestionController],
  "POST:/toggle-helpful":  [[auth], toggleQuestionHelpfulController],
  "DELETE:/delete":        [[auth], deleteOwnQuestionController],
  "DELETE:/admin/delete":  [[auth, checkPermission("products", "delete")], adminDeleteQuestionController],
  "PUT:/admin/moderate":   [[auth, checkPermission("products", "edit")], adminModerateQuestionController],
};

export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
