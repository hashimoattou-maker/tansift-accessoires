const { initializeDatabase: mysqlInit, getDatabase: mysqlGetDb } = require('./mysql');

let dbInstance = null;

async function initializeDatabase() {
  dbInstance = await mysqlInit();
  return dbInstance;
}

function getDatabase() {
  return dbInstance;
}

function saveDatabase() {
  // MySQL auto-persists, nothing to do
}

module.exports = { initializeDatabase, getDatabase, saveDatabase, DB_PATH: 'mysql' };
