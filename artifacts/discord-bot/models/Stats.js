const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
  supporterId: { type: String, required: true, unique: true },
  supporterName: { type: String, required: true },
  totalSessions: { type: Number, default: 0 },
  totalTime: { type: Number, default: 0 }, // ms
  lastActive: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Stats', statsSchema);
