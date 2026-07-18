import uploadImageCloudinary from "../utils/uploadImageCloudinary.js";

// UPLOAD IMAGE (admin) - generic image upload used by category, subcategory, product forms
export const uploadImageController = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "No file uploaded",
        error: true,
        success: false,
      });
    }

    const uploaded = await uploadImageCloudinary(file);

    return res.json({
      message: "Image uploaded successfully",
      error: false,
      success: true,
      data: {
        url: uploaded.secure_url,
        public_id: uploaded.public_id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};
