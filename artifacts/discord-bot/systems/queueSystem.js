const Queue = require('../models/Queue');

class QueueSystem {
  constructor() {
    this._io = null;
  }

  setIO(io) {
    this._io = io;
  }

  emit(event, data) {
    if (this._io) this._io.emit(event, data);
  }

  async add(member) {
    try {
      await Queue.findOneAndUpdate(
        { userId: member.id },
        {
          userId: member.id,
          username: member.user.username,
          avatarURL: member.user.displayAvatarURL({ size: 64 }),
          guildId: member.guild.id,
          joinedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      const list = await this.getAll();
      this.emit('queueUpdate', list);
      return list;
    } catch (err) {
      console.error('[QueueSystem] add error:', err);
    }
  }

  async remove(userId) {
    try {
      await Queue.deleteOne({ userId });
      const list = await this.getAll();
      this.emit('queueUpdate', list);
      return list;
    } catch (err) {
      console.error('[QueueSystem] remove error:', err);
    }
  }

  async getAll() {
    return Queue.find().sort({ joinedAt: 1 }).lean();
  }

  async getNext() {
    return Queue.findOne().sort({ joinedAt: 1 }).lean();
  }

  async has(userId) {
    const doc = await Queue.findOne({ userId }).lean();
    return !!doc;
  }

  async clear() {
    await Queue.deleteMany({});
    this.emit('queueUpdate', []);
  }

  async count() {
    return Queue.countDocuments();
  }
}

module.exports = new QueueSystem();
