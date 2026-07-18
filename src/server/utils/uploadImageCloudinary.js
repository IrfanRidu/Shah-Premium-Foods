import cloudinary from "../config/cloudinary.js";

/**
 * Uploads a file buffer to Cloudinary
 * @param {Express.Multer.File} file
 * @returns {Promise<import('cloudinary').UploadApiResponse>}
 */
const uploadImageCloudinary = async (file) => {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET_KEY
  ) {
    throw new Error(
      "Image upload is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET_KEY in backend/.env (see https://cloudinary.com/console for your credentials)."
    );
  }

  const buffer = file?.buffer || Buffer.from(await file.arrayBuffer());

  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "shah-premium-foods" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });

  return uploadResult;
};

export default uploadImageCloudinary;
