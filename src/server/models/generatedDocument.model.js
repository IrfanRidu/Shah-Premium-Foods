import mongoose from "mongoose";

const generatedDocumentSchema = new mongoose.Schema(
  {
    // Nullable and NOT relied on for display — see the denormalized
    // fields below. Kept only so a generated document can still be
    // traced back to its source template while that template still
    // exists (e.g. for a future "regenerate with updated data" action).
    templateId: { type: mongoose.Schema.ObjectId, ref: "documentTemplate", default: null },
    employeeId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    // Denormalized copies of the source template's identity at the
    // moment of generation — if HR renames or deletes the template
    // afterward, this employee's document history must NOT change
    // retroactively or break. Same "a past record stays historically
    // accurate" principle already applied to payrollRecordSchema's
    // deductionBreakdown (see employee.model.js).
    templateName: { type: String, default: "" },
    documentType: { type: String, default: "Other" },
    fileName: { type: String, required: true },
    fileData: { type: Buffer, required: true },
    format: { type: String, enum: ["docx", "pdf"], default: "docx" },
    generatedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const GeneratedDocumentModel = mongoose.models.generatedDocument || mongoose.model("generatedDocument", generatedDocumentSchema);
export default GeneratedDocumentModel;
