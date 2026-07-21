import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  pass_hash TEXT,
  salt TEXT,
  name TEXT,
  created INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  created INTEGER
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT,
  user_id INTEGER,
  date INTEGER,
  source TEXT,
  analysis TEXT,
  rec_done TEXT,
  PRIMARY KEY (id, user_id)
);
`;

function toPublicUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

function toSnapshot(row) {
  return {
    id: row.id,
    date: row.date,
    source: row.source,
    analysis: JSON.parse(row.analysis ?? 'null'),
    recDone: JSON.parse(row.rec_done ?? '{}'),
  };
}

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const stmts = {
    insertUser: db.prepare(
      'INSERT INTO users (email, pass_hash, salt, name, created) VALUES (?, ?, ?, ?, ?)'
    ),
    findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
    updateUserName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),

    insertSession: db.prepare(
      'INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)'
    ),
    findSession: db.prepare('SELECT * FROM sessions WHERE token = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

    listSnapshots: db.prepare(
      'SELECT * FROM snapshots WHERE user_id = ? ORDER BY date ASC'
    ),
    upsertSnapshot: db.prepare(
      `INSERT INTO snapshots (id, user_id, date, source, analysis, rec_done)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, user_id) DO UPDATE SET
         date = excluded.date,
         source = excluded.source,
         analysis = excluded.analysis,
         rec_done = excluded.rec_done`
    ),
    deleteSnapshot: db.prepare('DELETE FROM snapshots WHERE user_id = ? AND id = ?'),
    findSnapshot: db.prepare('SELECT * FROM snapshots WHERE user_id = ? AND id = ?'),
    updateRecDone: db.prepare(
      'UPDATE snapshots SET rec_done = ? WHERE user_id = ? AND id = ?'
    ),
  };

  return {
    createUser(email, passHash, salt) {
      try {
        const created = Date.now();
        const result = stmts.insertUser.run(email, passHash, salt, null, created);
        return toPublicUser(
          stmts.findUserById.get(Number(result.lastInsertRowid))
        );
      } catch (err) {
        if (String(err.code) === 'ERR_SQLITE_ERROR' && /UNIQUE/i.test(err.message)) {
          return null;
        }
        if (err.code === 'SQLITE_CONSTRAINT' || /SQLITE_CONSTRAINT/.test(err.message ?? '')) {
          return null;
        }
        throw err;
      }
    },

    findUserByEmail(email) {
      return stmts.findUserByEmail.get(email) ?? null;
    },

    findUserById(id) {
      return toPublicUser(stmts.findUserById.get(id));
    },

    updateUserName(id, name) {
      stmts.updateUserName.run(name, id);
    },

    createSession(token, userId) {
      stmts.insertSession.run(token, userId, Date.now());
    },

    findSession(token) {
      const row = stmts.findSession.get(token);
      return row ? { user_id: row.user_id } : null;
    },

    deleteSession(token) {
      stmts.deleteSession.run(token);
    },

    listSnapshots(userId) {
      const rows = stmts.listSnapshots.all(userId);
      return rows.map(toSnapshot);
    },

    upsertSnapshot(userId, snap) {
      stmts.upsertSnapshot.run(
        snap.id,
        userId,
        snap.date,
        snap.source,
        JSON.stringify(snap.analysis ?? null),
        JSON.stringify(snap.recDone ?? {})
      );
    },

    deleteSnapshot(userId, id) {
      stmts.deleteSnapshot.run(userId, id);
    },

    setRecDone(userId, snapId, recId, done) {
      const row = stmts.findSnapshot.get(userId, snapId);
      if (!row) return;
      const recDone = JSON.parse(row.rec_done ?? '{}');
      recDone[recId] = done;
      stmts.updateRecDone.run(JSON.stringify(recDone), userId, snapId);
    },

    close() {
      db.close();
    },
  };
}
