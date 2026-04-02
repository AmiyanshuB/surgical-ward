require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const dbUrl = new URL(process.env.DATABASE_URL);
const dbName = dbUrl.pathname.slice(1);

const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = '/postgres';

// Always use SSL with rejectUnauthorized: false for online/cloud PostgreSQL servers
const SSL = { rejectUnauthorized: false };

async function migrate() {
  console.log(`🔗 Connecting to: ${adminUrl.hostname}`);

  // Step 1: Create DB if it doesn't exist
  const adminPool = new Pool({
    connectionString: adminUrl.toString(),
    ssl: SSL,
  });

  try {
    await adminPool.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ Database "${dbName}" created`);
  } catch (err) {
    if (err.code === '42P04') {
      console.log(`ℹ️  Database "${dbName}" already exists`);
    } else {
      console.error('❌ Could not create database:', err.message);
      throw err;
    }
  } finally {
    await adminPool.end();
  }

  // Step 2: Run schema on the app database
  const appPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: SSL,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await appPool.query(sql);
    console.log('✅ Migration complete');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    await appPool.end();
  }
}

migrate();