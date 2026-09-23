import multer from 'multer';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, allowedTypes.has(file.mimetype) ? true : new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, and WEBP images are supported.'))
});
