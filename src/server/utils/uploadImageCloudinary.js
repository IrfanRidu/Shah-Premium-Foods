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
      {
        folder: "shah-premium-foods",

        // Security/optimization audit (Section 6 — File Upload Security):
        // — Random filename: no `public_id` or `use_filename` is passed,
        //   which is exactly what makes Cloudinary generate its own random
        //   unique public_id rather than deriving one from the client-
        //   supplied original filename.
        // — Image compression: `quality: "auto"` applies Cloudinary's
        //   automatic perceptual-quality optimization, balancing file size
        //   against visible quality rather than storing at 100% quality.
        //   Safe and applied for every upload regardless of how the
        //   resulting URL is later used.
        quality: "auto",

        // — Convert to WebP / strip metadata: deliberately NOT forced
        //   here at upload time. This function is shared by every upload
        //   feature in the app, and the stored `secure_url` isn't only
        //   ever used in <img> tags — e.g.
        //   dashboard/product-requests/page.jsx fetches a submitted
        //   list-photo's URL directly and embeds it in a jsPDF export
        //   hardcoded as `doc.addImage(dataUrl, "JPEG", ...)`. Forcing
        //   the stored asset to become WebP would silently break that
        //   export (and any other raw, non-<img> consumer of these URLs
        //   this app might have that wasn't caught in this pass). Use
        //   `cloudinaryWebpUrl()` in lib/utils.js instead at the specific
        //   call sites that display an image in an <img>/CSS
        //   background — it applies the same WebP + metadata-stripping
        //   benefit as a delivery-time transform on that one URL, without
        //   touching the stored original that other consumers may still
        //   need in its native format.
      },
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
