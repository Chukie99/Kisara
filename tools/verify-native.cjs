const assert = require('node:assert/strict')
const Database = require('better-sqlite3')

// better-sqlite3 13 ships a Node-API binary shared by Node and Electron; ABI rebuilds discard that benefit.
const db = new Database(':memory:')
try {
  assert.equal(db.prepare('SELECT 1 AS ok').get().ok, 1)
  console.log('SQLite native binary ready (Node-API).')
} finally {
  db.close()
}
