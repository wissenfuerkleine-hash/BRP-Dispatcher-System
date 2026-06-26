const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  avatarURL: { type: String, default: null },
  joinedAt: { type: Date, default: Date.now },
  guildId: { type: String, required: true },
});

module.exports = mongoose.model('Queue', queueSchema);
