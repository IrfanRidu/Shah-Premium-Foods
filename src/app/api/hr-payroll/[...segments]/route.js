import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission, superAdminOnly } from "@/server/middlewares/permission";
import {
  listEmployeesController, createEmployeeController, updateEmployeeController, deleteEmployeeController,
  createEmployeeWithLoginController,
  listPayrollController, upsertPayrollController,
  getPayrollConfigController, updatePayrollConfigController,
  getEmployeeFileController, addEmployeeEventController, deleteEmployeeEventController,
} from "@/server/controllers/hrPayroll.controller";
import {
  listTemplatesController, uploadTemplateController, deleteTemplateController,
  generateDocumentController, listGeneratedDocumentsController, downloadGeneratedDocumentController,
} from "@/server/controllers/documentTemplate.controller";
import {
  uploadEmployeeDocumentController, listEmployeeDocumentsController, downloadEmployeeDocumentController,
  deleteEmployeeDocumentController, reviewEmployeeDocumentController,
} from "@/server/controllers/employeeDocument.controller";

const ROUTES = {
  "GET:/employees":             [[auth, checkPermission("hrPayroll", "view")], listEmployeesController],
  "POST:/employees":            [[auth, checkPermission("hrPayroll", "edit")], createEmployeeController],
  "POST:/employees-with-login": [[auth, checkPermission("hrPayroll", "edit")], createEmployeeWithLoginController],
  "PUT:/employees":             [[auth, checkPermission("hrPayroll", "edit")], updateEmployeeController],
  "DELETE:/employees":          [[auth, checkPermission("hrPayroll", "edit")], deleteEmployeeController],
  "GET:/payroll":               [[auth, checkPermission("hrPayroll", "view")], listPayrollController],
  "POST:/payroll":              [[auth, checkPermission("hrPayroll", "edit")], upsertPayrollController],
  // Advanced HRMS Features spec: "Tax rules should be configurable by
  // Super Admin." Readable by anyone who can see Payroll at all (HR needs
  // to understand what a number came from, and the client computes a live
  // preview before saving) — only writing the rules is Super-Admin-only.
  "GET:/payroll-config":         [[auth, checkPermission("hrPayroll", "view")], getPayrollConfigController],
  "PUT:/payroll-config":         [[auth, superAdminOnly], updatePayrollConfigController],
  // Employee Digital File (Phase B) — same hrPayroll view/edit gate as
  // everything else in this module, not a new permission module.
  "GET:/employee-file":          [[auth, checkPermission("hrPayroll", "view")], getEmployeeFileController],
  "POST:/employee-events":       [[auth, checkPermission("hrPayroll", "edit")], addEmployeeEventController],
  "DELETE:/employee-events":     [[auth, checkPermission("hrPayroll", "edit")], deleteEmployeeEventController],
  // Dynamic Document Generation (Phase C). "POST:/templates" is also
  // listed in lib/apiHandler.js's DOCUMENT_UPLOAD_ROUTES — the two must
  // stay in sync (that's what tells the shared upload handler to expect
  // a .docx here instead of an image, the only other kind of upload this
  // app has). Still hrPayroll view/edit, not a new permission module.
  "GET:/templates":              [[auth, checkPermission("hrPayroll", "view")], listTemplatesController],
  "POST:/templates":             [[auth, checkPermission("hrPayroll", "edit")], uploadTemplateController],
  "DELETE:/templates":           [[auth, checkPermission("hrPayroll", "edit")], deleteTemplateController],
  "POST:/generate-document":     [[auth, checkPermission("hrPayroll", "edit")], generateDocumentController],
  "GET:/generated-documents":    [[auth, checkPermission("hrPayroll", "view")], listGeneratedDocumentsController],
  "GET:/generated-document-download": [[auth, checkPermission("hrPayroll", "view")], downloadGeneratedDocumentController],
  // Smart Document Processing (Phase D). "POST:/employee-documents" is
  // also listed in lib/apiHandler.js's UPLOAD_VALIDATORS — the two must
  // stay in sync (that's what tells the shared upload handler to expect
  // an image-or-PDF here, not a plain image or a .docx template).
  "POST:/employee-documents":       [[auth, checkPermission("hrPayroll", "edit")], uploadEmployeeDocumentController],
  "GET:/employee-documents":        [[auth, checkPermission("hrPayroll", "view")], listEmployeeDocumentsController],
  "DELETE:/employee-documents":     [[auth, checkPermission("hrPayroll", "edit")], deleteEmployeeDocumentController],
  "GET:/employee-document-download": [[auth, checkPermission("hrPayroll", "view")], downloadEmployeeDocumentController],
  "POST:/employee-document-review": [[auth, checkPermission("hrPayroll", "edit")], reviewEmployeeDocumentController],
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
