import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

// Advanced HRMS Features spec's exact placeholder list — the single
// source of truth both extractPlaceholders() (what's IN a template) and
// resolvePlaceholderData() (what values we can actually supply) are
// checked against, so the "Generate Document" UI can tell HR which
// placeholders in their uploaded template we have real data for vs.
// which will render blank.
export const KNOWN_PLACEHOLDERS = [
  "employee_name", "employee_id", "designation", "department", "joining_date",
  "salary", "manager_name", "company_name", "address", "passport_number",
  "nid_number", "bank_account", "tax_id", "current_date",
];

// Finds every {{xxx}} token actually present in a .docx's text content —
// shown to HR immediately after upload so they can confirm the template
// is wired correctly (e.g. catch a typo'd {{employe_name}} before anyone
// tries to generate a real letter with it), rather than discovering it
// only once a placeholder silently renders blank on a real document.
// Uses docxtemplater's own text extraction rather than a naive regex
// over the raw XML — Word frequently splits a single {{placeholder}}
// across multiple internal text runs (due to spell-check, autocorrect,
// or just incidental formatting boundaries), which a regex over raw XML
// would miss entirely; docxtemplater already solves exactly this problem
// as part of its normal parsing.
export function extractPlaceholders(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  const text = doc.getFullText();
  const matches = text.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) || [];
  const names = matches.map((m) => m.replace(/[{}]/g, "").trim());
  return [...new Set(names)];
}

// Advanced HRMS Features spec: "The system should automatically replace
// placeholders with employee information." Maps the spec's exact
// placeholder names to real values from the employee record (+ company
// name). Deliberately kept separate from the Employee schema's own field
// names (e.g. the spec's {{joining_date}} vs. the schema's `joinDate`)
// so a future schema rename doesn't also silently break every template
// already out in the world using {{joining_date}}.
export function resolvePlaceholderData(employee, companyName) {
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "");
  return {
    employee_name: employee.name || "",
    employee_id: employee._id?.toString() || "",
    designation: employee.designation || "",
    department: employee.department || "",
    joining_date: fmt(employee.joinDate),
    salary: employee.monthlySalary != null ? String(employee.monthlySalary) : "",
    manager_name: employee.managerName || "",
    company_name: companyName || "",
    address: employee.address || "",
    passport_number: employee.passportNumber || "",
    nid_number: employee.nidNumber || "",
    bank_account: employee.bankAccount || "",
    tax_id: employee.taxId || "",
    current_date: fmt(new Date()),
  };
}

// Fills every {{placeholder}} in a .docx template with real values and
// returns a new, fully-formatted .docx buffer. Logos, tables, fonts,
// headers/footers, signatures, page layout — everything from the
// original template survives untouched, because docxtemplater edits the
// document's existing text runs in place rather than regenerating the
// file from scratch; this is precisely the spec's own requirement that
// "The generated document should look identical to the original
// template except for the dynamically filled employee information."
// Any placeholder present in the template but missing from `data`
// (nullGetter) renders as an empty string rather than throwing — a
// template with a typo'd or currently-unsupported placeholder should
// still generate a usable document with one blank spot, not fail the
// whole request.
export function renderDocxTemplate(templateBuffer, data) {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" });
}

// Advanced HRMS Features spec: "Export Formats: DOCX, PDF, XLSX... The
// exported files should preserve the original formatting." Genuine
// docx→pdf conversion that preserves complex Word formatting isn't
// something pure JavaScript can do well — this shells out to LibreOffice
// headless (free, open-source, self-hostable — the same "no paid cloud
// services" requirement the rest of this build's telephony/OCR sections
// state explicitly). LibreOffice must be installed on the deployment
// server separately — a system package, not an npm dependency, the same
// category of external requirement Asterisk was for the CRM module, and
// something this sandbox has no way to install or test live (no network
// access here — same honest caveat already applied to the SIP.js/
// Asterisk code from the CRM module).
//
// Deliberately fails soft: if `soffice` isn't on PATH, this returns
// null rather than throwing, so DOCX generation — the primary,
// dependency-free path — keeps working even on a server that never
// installed LibreOffice. Same graceful-degradation principle the spec
// itself states for a different feature ("If biometric hardware is
// unavailable, manual attendance must continue to work").
export async function convertDocxToPdf(docxBuffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hrms-doc-"));
  const inputPath = path.join(tmpDir, "input.docx");
  try {
    await fs.writeFile(inputPath, docxBuffer);
    await execFileAsync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, inputPath], { timeout: 30000 });
    const outputPath = path.join(tmpDir, "input.pdf");
    return await fs.readFile(outputPath);
  } catch (err) {
    console.error("PDF conversion unavailable (LibreOffice not installed, or the conversion failed):", err.message);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
