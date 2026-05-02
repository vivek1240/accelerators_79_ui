const mongoose = require('mongoose');

const userUploadSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    fileId: { type: String, required: true },
    filename: { type: String, default: '' },
    memoryId: { type: String, default: null },
    /** From FastAPI upload response (optional, for UI / client docs). */
    pagesCount: { type: Number, default: null },
    filteredPagesCount: { type: Number, default: null },
    parsed: { type: Boolean, default: null },
    uploadStatus: { type: String, default: null },
  },
  { timestamps: true }
);

userUploadSchema.index({ userId: 1, fileId: 1 }, { unique: true });

module.exports = mongoose.model('UserUpload', userUploadSchema);
