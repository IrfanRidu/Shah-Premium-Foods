import mongoose from "mongoose";

const modulePermSchema = {
  view: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
};

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isSystemRole: { type: Boolean, default: false }, // SUPERADMIN/ADMIN/USER — cannot be deleted
    permissions: {
      dashboard:  { view: { type: Boolean, default: false } },
      products:   modulePermSchema,
      categories: modulePermSchema,
      orders:     { view: { type: Boolean, default: false }, edit: { type: Boolean, default: false }, cancel: { type: Boolean, default: false } },
      customers:  { view: { type: Boolean, default: false }, export: { type: Boolean, default: false }, call: { type: Boolean, default: false } },
      inventory:  { view: { type: Boolean, default: false }, edit: { type: Boolean, default: false } },
      coupons:    modulePermSchema,
      campaigns: modulePermSchema,
      analytics:  { view: { type: Boolean, default: false } },
      settings:   { view: { type: Boolean, default: false }, edit: { type: Boolean, default: false } },
      roles:      { view: { type: Boolean, default: false }, create: { type: Boolean, default: false }, edit: { type: Boolean, default: false }, delete: { type: Boolean, default: false } },
      customerCare: { view: { type: Boolean, default: false }, edit: { type: Boolean, default: false } },
      hrPayroll:    { view: { type: Boolean, default: false }, edit: { type: Boolean, default: false } },
    },
    createdBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const RoleModel = mongoose.models.role || mongoose.model("role", roleSchema);
export default RoleModel;
