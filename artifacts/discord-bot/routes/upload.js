const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireSecret } = require('../middlewares/auth');

const ALLOWED = ['waiting.mp3', 'busy.mp3', 'offline.mp3'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'audio');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const target = req.params.filename;
    if (!ALLOWED.includes(target)) return cb(new Error('Invalid filename'));
    cb(null, target);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const target = req.params.filename;
    if (!ALLOWED.includes(target)) return cb(new Error('Invalid filename'));
    if (!file.mimetype.startsWith('audio/')) return cb(new Error('Only audio files allowed'));
    cb(null, true);
  },
});

// POST /upload/:filename  (waiting.mp3 | busy.mp3 | offline.mp3)
router.post('/:filename', requireSecret, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ ok: true, filename: req.file.filename });
  });
});

module.exports = router;
