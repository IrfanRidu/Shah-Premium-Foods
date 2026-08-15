import "server-only";
import EmployeeDocumentModel, { EMPLOYEE_DOCUMENT_TYPES } from "../models/employeeDocument.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { runOcr, extractDocumentFields } from "../services/ocrEngine.js";

// Advanced HRMS Features spec: "After upload: Detect document type [—
// HR selects it explicitly here rather than auto-detecting, a
// deliberate scope choice; see the module's own notes]. Extract text.
// Identify fields automatically. Populate employee profile fields.
// Highlight low-confidence fields for manual review. Preserve the
// original uploaded document." OCR only runs for image uploads — see
// ocrEngine.js's own notes on why PDF scans aren't processed in this
// build (still uploaded and stored either way, just without automatic
// extraction).
export const uploadEmployeeDocumentController = async (req, res) => {
  try {
    const { employeeId, documentType } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: true, message: "No file uploaded" });
    const employeeExists = await EmployeeModel.exists({ _id: employeeId });
    if (!employeeExists) return res.status(404).json({ success: false, error: true, message: "Employee not found" });

    const type = EMPLOYEE_DOCUMENT_TYPES.includes(documentType) ? documentType : "Other";
    const isPdf = file.detectedMime === "application/pdf";

    let extractedFields = [];
    let ocrRawText = "";
    let status = "Needs Review";
    let statusMessage;

    if (isPdf) {
      statusMessage = "Document uploaded. Automatic field extraction isn't available for PDF uploads in this build — please review and fill fields in manually.";
    } else {
      try {
        const ocrResult = await runOcr(file.buffer);
        ocrRawText = ocrResult.text || "";
        extractedFields = extractDocumentFields(type, ocrRawText).fields;
        statusMessage = extractedFields.length > 0
          ? `Document uploaded and processed — found ${extractedFields.length} field${extractedFields.length === 1 ? "" : "s"}. Please review before applying to the profile.`
          : "Document uploaded, but no fields could be automatically extracted from it. Please review and fill fields in manually.";
      } catch (err) {
        console.error("OCR failed:", err.message);
        status = "Failed";
        statusMessage = "Document uploaded, but automatic processing failed. You can still fill fields in manually.";
      }
    }

    const doc = await new EmployeeDocumentModel({
      employeeId, documentType: type, fileName: file.originalname,
      fileData: file.buffer, mimeType: file.detectedMime || file.mimetype || "",
      extractedFields, ocrRawText, status,
      uploadedBy: req.userId,
    }).save();

    const { fileData, ocrRawText: _omit, ...safeDoc } = doc.toObject();
    return res.status(201).json({ success: true, error: false, data: safeDoc, message: statusMessage });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Employee File drawer's "Uploaded Documents" section — never includes
// fileData/ocrRawText in a list response, same discipline as every
// other binary-field list in this app.
export const listEmployeeDocumentsController = async (req, res) => {
  try {
    const { employeeId } = req.query;
    const docs = await EmployeeDocumentModel.find({ employeeId }).select("-fileData -ocrRawText").sort({ createdAt: -1 });
    return res.json({ success: true, error: false, data: docs });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const downloadEmployeeDocumentController = async (req, res) => {
  try {
    const { _id } = req.query;
    const doc = await EmployeeDocumentModel.findById(_id);
    if (!doc) return res.status(404).json({ success: false, error: true, message: "Document not found" });
    return res.json({
      success: true, error: false,
      data: { fileName: doc.fileName, mimeType: doc.mimeType || "application/octet-stream", base64: doc.fileData.toString("base64") },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const deleteEmployeeDocumentController = async (req, res) => {
  try {
    const { _id } = req.body;
    await EmployeeDocumentModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Document deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Advanced HRMS Features spec: "The HR user can edit extracted values
// before saving." HR reviews the (possibly OCR-imperfect) extracted
// fields, corrects anything wrong, and this call both records that
// review AND writes the confirmed values onto the actual Employee
// profile in one step — a review that's never applied anywhere isn't
// useful to anyone, so this doesn't split "confirm" and "apply" into
// two separate actions.
const FIELD_TO_EMPLOYEE_KEY = {
  passport_number: "passportNumber",
  nid_number: "nidNumber",
  full_name: null, // deliberately not auto-applied — see note below
  nationality: "nationality",
  date_of_birth: "dateOfBirth",
  gender: "gender",
  date_of_expiry: null, // describes the DOCUMENT, not the person — see employee.model.js's own note on why this isn't a profile field
  issuing_country: null,
  father_name: "fatherName",
  mother_name: "motherName",
  address: "address",
};

export const reviewEmployeeDocumentController = async (req, res) => {
  try {
    const { _id, fields } = req.body; // fields: [{field, value}] — HR's confirmed/corrected values
    const doc = await EmployeeDocumentModel.findById(_id);
    if (!doc) return res.status(404).json({ success: false, error: true, message: "Document not found" });

    if (Array.isArray(fields)) {
      const updates = {};
      for (const { field, value } of fields) {
        const employeeKey = FIELD_TO_EMPLOYEE_KEY[field];
        // full_name/date_of_expiry/issuing_country are intentionally
        // excluded from FIELD_TO_EMPLOYEE_KEY (mapped to null) — full
        // name would silently clobber the name HR already entered when
        // creating the employee record (a much more deliberate, direct
        // action than a document review should be able to override),
        // and the other two describe the document, not the person.
        if (employeeKey && value?.trim()) updates[employeeKey] = value.trim();
      }
      if (Object.keys(updates).length > 0) {
        await EmployeeModel.findByIdAndUpdate(doc.employeeId, updates);
      }
      doc.extractedFields = fields.map((f) => ({
        field: f.field, value: f.value,
        confidence: doc.extractedFields.find((existing) => existing.field === f.field)?.confidence || 0,
      }));
    }
    doc.status = "Reviewed";
    doc.reviewedBy = req.userId;
    doc.reviewedAt = new Date();
    await doc.save();

    return res.json({ success: true, error: false, message: "Reviewed and applied to the employee profile" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
