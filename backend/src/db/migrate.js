require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Parse the DATABASE_URL to extract the DB name and build a postgres-level URL
const dbUrl = new URL(process.env.DATABASE_URL);
const dbName = dbUrl.pathname.slice(1); // e.g. "surgical_ward"

// Connect to the default "postgres" database to create our DB if needed
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = '/postgres';

async function migrate() {
  // Step 1: create DB if it doesn't exist
  const adminPool = new Pool({ connectionString: adminUrl.toString(), ssl: false });
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

  // Step 2: run schema migrations on the actual DB
  const appPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
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