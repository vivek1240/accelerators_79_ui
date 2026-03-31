const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    hashed_password: { type: String, required: true },
    name: { type: String, default: null },
    role: { type: String, default: 'admin' },
    is_allowed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
