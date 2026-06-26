const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  supporterId: { type: String, required: true },
  supporterName: { type: String, required: true },
  citizenId: { type: String, required: true },
  citizenName: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  waitTime: { type: Number, default: 0 }, // ms from queue join to move
  active: { type: Boolean, default: true },
});

module.exports = mongoose.model('Session', sessionSchema);
