import mongoose from "mongoose";

const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Sub category name is required"],
      trim: true,
    },
    image: {
      type: String,
      default: "",
    },
    category: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "category",
      },
    ],
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

const SubCategoryModel = mongoose.models.subCategory || mongoose.model("subCategory", subCategorySchema);

export default SubCategoryModel;
