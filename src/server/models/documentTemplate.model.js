import mongoose from "mongoose";

// Advanced HRMS Features spec's own example list of document types —
// kept as an exported enum so the frontend's "choose document type"
// dropdown and this schema can never drift apart.
export const DOCUMENT_TYPES = [
  "Appointment Letter", "Employment Agreement", "Offer Letter", "Confirmation Letter",
  "Promotion Letter", "Warning Letter", "Experience Certificate", "Job Certificate",
  "Salary Certificate", "Salary Increment Letter", "Relieving Letter", "Resignation Acceptance Letter",
  "Bank Salary Transfer Application", "Leave Approval Letter", "Loan Approval Letter", "NDA",
  "Confidentiality Agreement", "Internship Certificate", "Contract Renewal", "Employee ID Card",
  "Tax Certificate", "Other",
];

const documentTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // HR's own label, e.g. "2026 Standard Offer Letter"
    documentType: { type: String, enum: DOCUMENT_TYPES, default: "Other" },
    fileName: { type: String, required: true }, // original filename — display only, never used as a storage path (same discipline fileUploadSecurity.js already applies to image uploads)
    // The actual .docx binary, stored in Mongo rather than on disk. This
    // app documents a Vercel deployment path (VERCEL_DEPLOYMENT.md)
    // where the filesystem is ephemeral/read-only in production —
    // writing templates to local disk would silently lose them on the
    // next deploy there, so the database is the only storage that's
    // correct for both that path and a VPS deployment.
    fileData: { type: Buffer, required: true },
    // Auto-detected {{xxx}} tokens found in the template at upload time
    // — shown to HR immediately so they can confirm the template is
    // wired correctly (catch a typo like {{employe_name}} before anyone
    // tries to generate a real letter with it) rather than discovering
    // it only once a placeholder silently renders blank.
    placeholders: { type: [String], default: [] },
    uploadedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const DocumentTemplateModel = mongoose.models.documentTemplate || mongoose.model("documentTemplate", documentTemplateSchema);
export default DocumentTemplateModel;
