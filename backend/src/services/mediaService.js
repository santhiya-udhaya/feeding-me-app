import cloudinary, { configureCloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

export async function uploadImage(buffer, folder) {
  if (!isCloudinaryConfigured()) throw Object.assign(new Error('Cloudinary media storage is not configured.'), { status: 503 });
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image', transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }] }, (error, result) => {
      if (error) return reject(Object.assign(new Error('Image upload failed.'), { status: 502 }));
      resolve({ publicId: result.public_id, url: result.secure_url, resourceType: result.resource_type, format: result.format, width: result.width, height: result.height, bytes: result.bytes });
    });
    stream.end(buffer);
  });
}

export async function deleteImage(publicId) {
  if (!publicId || !isCloudinaryConfigured()) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
}
