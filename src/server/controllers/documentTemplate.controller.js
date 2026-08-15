import "server-only";
import DocumentTemplateModel, { DOCUMENT_TYPES } from "../models/documentTemplate.model.js";
import GeneratedDocumentModel from "../models/generatedDocument.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import SiteSettingsModel from "../models/siteSettings.model.js";
import {
  extractPlaceholders, resolvePlaceholderData, renderDocxTemplate, convertDocxToPdf,
} from "../services/documentTemplateEngine.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

// ── Templates ──────────────────────────────────────────────────
// Never includes fileData in a list response — could be several MB
// across many templates, and the list view only needs name/type/
// placeholders/who-uploaded-it, same "select -fileData" discipline used
// everywhere else a binary field's parent gets listed in this app.
export const listTemplatesController = async (req, res) => {
  try {
    const templates = await DocumentTemplateModel.find().select("-fileData").sort({ createdAt: -1 }).populate("uploadedBy", "name");
    return res.json({ success: true, error: false, data: templates });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const uploadTemplateController = async (req, res) => {
  try {
    const { name, documentType } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: true, message: "No file uploaded" });
    if (!name?.trim()) return res.status(400).json({ success: false, error: true, message: "Template name is required" });

    let placeholders = [];
    try {
      placeholders = extractPlaceholders(file.buffer);
    } catch (err) {
      // A file can pass the ZIP-magic-bytes + .docx-extension check in
      // fileUploadSecurity.js and still not be a document docxtemplater
      // can parse (a corrupted file, or a genuine ZIP that just happens
      // to have a .docx extension) — this is the actual content-level
      // validation, distinct from and downstream of that upload-layer
      // check.
      return res.status(400).json({ success: false, error: true, message: "This file couldn't be read as a valid Word document. Please re-save it in Word or LibreOffice and try uploading again." });
    }

    const template = await new DocumentTemplateModel({
      name: name.trim(),
      documentType: DOCUMENT_TYPES.includes(documentType) ? documentType : "Other",
      fileName: file.originalname,
      fileData: file.buffer,
      placeholders,
      uploadedBy: req.userId,
    }).save();

    const { fileData, ...safeTemplate } = template.toObject();
    return res.status(201).json({
      success: true, error: false, data: safeTemplate,
      message: placeholders.length
        ? `Template uploaded — found ${placeholders.length} placeholder${placeholders.length === 1 ? "" : "s"}: ${placeholders.join(", ")}`
        : "Template uploaded — no {{placeholders}} were found in it, so generated documents from it will be identical to the original every time.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const deleteTemplateController = async (req, res) => {
  try {
    const { _id } = req.body;
    await DocumentTemplateModel.findByIdAndDelete(_id);
    // Deliberately does NOT cascade-delete GeneratedDocumentModel records
    // — unlike deleteEmployeeController's cascade to EmployeeEventModel
    // (which really should disappear with the employee), a document
    // already generated and placed in someone's employee file is a real
    // historical record of a letter that was actually issued; deleting
    // the template it came from shouldn't retroactively erase that it
    // happened. templateId on those records goes stale/null-referencing,
    // which is fine — templateName/documentType were denormalized onto
    // them at generation time specifically so they don't need the
    // template to still exist to stay meaningful (see that schema's own
    // comment).
    return res.json({ success: true, error: false, message: "Template deleted. Documents already generated from it are kept in employee files." });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Generate ───────────────────────────────────────────────────
// Advanced HRMS Features spec's whole workflow in one call: "HR selects
// 'Generate Document.' HR chooses the document type. HR searches for an
// employee... The system automatically fills every placeholder with
// [their] data. HR previews the completed document. HR downloads or
// prints it. No manual editing should be required." — returns the
// generated file's content directly (base64) in this same response
// rather than requiring a second round trip, since generating and then
// immediately wanting the file is the overwhelmingly common case; a
// separate download endpoint below exists for re-fetching something from
// history later without regenerating it.
export const generateDocumentController = async (req, res) => {
  try {
    const { templateId, employeeId, format } = req.body;
    const template = await DocumentTemplateModel.findById(templateId);
    if (!template) return res.status(404).json({ success: false, error: true, message: "Template not found" });
    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, error: true, message: "Employee not found" });

    const settings = await SiteSettingsModel.findOne({ key: "main" });
    const data = resolvePlaceholderData(employee, settings?.siteName || "");

    let docxBuffer;
    try {
      docxBuffer = renderDocxTemplate(template.fileData, data);
    } catch (err) {
      return res.status(500).json({ success: false, error: true, message: "Couldn't generate this document — the template file may be corrupted. Try re-uploading it." });
    }

    let fileData = docxBuffer;
    let fileName = `${template.name} - ${employee.name}.docx`;
    let actualFormat = "docx";

    if (format === "pdf") {
      const pdfBuffer = await convertDocxToPdf(docxBuffer);
      if (pdfBuffer) {
        fileData = pdfBuffer;
        fileName = `${template.name} - ${employee.name}.pdf`;
        actualFormat = "pdf";
      }
      // else: PDF conversion isn't available on this server (LibreOffice
      // not installed, or the conversion failed) — falls back to handing
      // back the .docx rather than failing the whole request. The
      // response's `format` field tells the frontend which one it
      // actually got, so it can say so honestly instead of mislabeling
      // a .docx as the PDF the person asked for.
    }

    const generated = await new GeneratedDocumentModel({
      templateId: template._id,
      employeeId: employee._id,
      templateName: template.name,
      documentType: template.documentType,
      fileName,
      fileData,
      format: actualFormat,
      generatedBy: req.userId,
    }).save();

    return res.status(201).json({
      success: true, error: false,
      data: {
        _id: generated._id,
        fileName: generated.fileName,
        format: actualFormat,
        mimeType: actualFormat === "pdf" ? PDF_MIME : DOCX_MIME,
        base64: fileData.toString("base64"),
      },
      message: format === "pdf" && actualFormat !== "pdf"
        ? "PDF export isn't available on this server (LibreOffice isn't installed) — generated as a Word document instead."
        : "Document generated",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Employee File drawer's "Generated Documents" section — list only,
// same -fileData discipline as listTemplatesController above.
export const listGeneratedDocumentsController = async (req, res) => {
  try {
    const { employeeId } = req.query;
    const docs = await GeneratedDocumentModel.find({ employeeId }).select("-fileData").sort({ createdAt: -1 });
    return res.json({ success: true, error: false, data: docs });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Re-download something already generated, without regenerating it —
// this app's shared response layer (see lib/apiHandler.js's
// buildMockResponse) only supports JSON/text responses, not a raw
// binary Response with custom headers, so this returns base64 the same
// way generateDocumentController's own response does; the frontend's
// downloadBase64File() helper is what actually turns either of these
// into a real browser file download.
export const downloadGeneratedDocumentController = async (req, res) => {
  try {
    const { _id } = req.query;
    const doc = await GeneratedDocumentModel.findById(_id);
    if (!doc) return res.status(404).json({ success: false, error: true, message: "Document not found" });
    return res.json({
      success: true, error: false,
      data: {
        fileName: doc.fileName,
        format: doc.format,
        mimeType: doc.format === "pdf" ? PDF_MIME : DOCX_MIME,
        base64: doc.fileData.toString("base64"),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
