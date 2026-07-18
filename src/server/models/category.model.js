import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    image: {
      type: String,
      default: "",
    },
    translations: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const CategoryModel = mongoose.models.category || mongoose.model("category", categorySchema);

export default CategoryModel;
