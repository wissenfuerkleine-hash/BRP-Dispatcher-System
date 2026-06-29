const { Pool } = require('pg');
require('dotenv').config();

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'discord_security',
    user: 'postgres',
    password: 'postgres'
  });
}

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id SERIAL PRIMARY KEY,
        incident_id VARCHAR(50) UNIQUE,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        mode VARCHAR(20) DEFAULT 'AUTO',
        level INTEGER DEFAULT 1,
        reason TEXT,
        threat_score INTEGER DEFAULT 0,
        role_tier_impact TEXT,
        initiator VARCHAR(50),
        timeline JSONB,
        system_status JSONB,
        recovery_status JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id SERIAL PRIMARY KEY,
        incident_id VARCHAR(50),
        channels JSONB,
        roles JSONB,
        permissions JSONB,
        invites JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS threat_scores (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        guild_id VARCHAR(50),
        score INTEGER DEFAULT 0,
        role_tier INTEGER DEFAULT 2,
        events JSONB,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50),
        user_id VARCHAR(50),
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
