"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = uploadToCloudinary;
exports.deleteFromCloudinary = deleteFromCloudinary;
const cloudinary_1 = require("cloudinary");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
async function uploadToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({ public_id: publicId, folder: 'pesaapp', resource_type: 'image', quality: 'auto' }, (error, result) => {
            if (error || !result)
                return reject(error || new Error('Upload failed'));
            resolve(result.secure_url);
        });
        stream.end(buffer);
    });
}
async function deleteFromCloudinary(publicId) {
    await cloudinary_1.v2.uploader.destroy(publicId);
}
//# sourceMappingURL=cloudinary.service.js.map