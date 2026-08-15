import mongoose from "mongoose";

// Advanced HRMS Features spec's own "Supported documents" list.
export const EMPLOYEE_DOCUMENT_TYPES = [
  "Passport", "National ID", "Driving License", "Birth Certificate",
  "Educational Certificate", "Experience Certificate", "Bank Document",
  "Tax Document", "Other",
];

const extractedFieldSchema = new mongoose.Schema(
  {
    field: { type: String, required: true }, // e.g. "passport_number" — deliberately the SAME vocabulary as documentTemplateEngine.js's placeholder names where they overlap, so a reviewed value maps cleanly onto both the Employee profile and future document generation
    value: { type: String, default: "" },
    // Spec: "Highlight low-confidence fields for manual review." 0-1;
    // set by the extractor that produced it — a validated MRZ checksum
    // earns high confidence, an unvalidated heuristic guess earns low
    // confidence. See ocrEngine.js for how each extractor sets this.
    confidence: { type: Number, default: 0, min: 0, max: 1 },
  },
  { _id: false }
);

const employeeDocumentSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    documentType: { type: String, enum: EMPLOYEE_DOCUMENT_TYPES, default: "Other" },
    fileName: { type: String, required: true },
    // Spec: "Preserve the original uploaded document." Stored in Mongo
    // for the same reason documentTemplate.model.js's fileData is (this
    // app's Vercel deployment path has an ephemeral filesystem).
    fileData: { type: Buffer, required: true },
    mimeType: { type: String, default: "" },
    extractedFields: { type: [extractedFieldSchema], default: [] },
    ocrRawText: { type: String, default: "" }, // kept so HR can sanity-check an extraction against the actual OCR output, not just trust the parsed fields blindly
    // Processing: OCR/extraction ran, nobody has reviewed the result yet.
    // Needs Review: extraction finished but produced low-confidence or
    // no structured fields (or the upload was a PDF, which this build
    // doesn't run OCR on — see ocrEngine.js). Reviewed: HR confirmed/
    // corrected the fields and applied them to the employee profile.
    // Failed: OCR itself errored (corrupt image, unreadable file).
    status: { type: String, enum: ["Processing", "Needs Review", "Reviewed", "Failed"], default: "Processing" },
    reviewedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    reviewedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const EmployeeDocumentModel = mongoose.models.employeeDocument || mongoose.model("employeeDocument", employeeDocumentSchema);
export default EmployeeDocumentModel;
