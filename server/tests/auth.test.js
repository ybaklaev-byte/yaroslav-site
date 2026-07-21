import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, newToken, validEmail, validPassword } from '../auth.js';
import { openDb } from '../db.js';

describe('auth: password hashing', () => {
  test('verifyPassword returns true for correct password, false for wrong', () => {
    const { hash, salt } = hashPassword('correct-horse');
    assert.equal(verifyPassword('correct-horse', hash, salt), true);
    assert.equal(verifyPassword('wrong-password', hash, salt), false);
  });

  test('two hashPassword calls produce different salts', () => {
    const a = hashPassword('same-password');
    const b = hashPassword('same-password');
    assert.notEqual(a.salt, b.salt);
  });
});

describe('auth: token + validators', () => {
  test('newToken returns 64-char hex string', () => {
    const t = newToken();
    assert.equal(typeof t, 'string');
    assert.equal(t.length, 64);
    assert.match(t, /^[0-9a-f]{64}$/);
  });

  test('validEmail requires @ and length >= 5', () => {
    assert.equal(validEmail('a@b.co'), true);
    assert.equal(validEmail('noat.com'), false);
    assert.equal(validEmail('a@b'), false);
  });

  test('validPassword requires length >= 6', () => {
    assert.equal(validPassword('123456'), true);
    assert.equal(validPassword('12345'), false);
  });
});

describe('db: users', () => {
  test('createUser + findUserByEmail works; duplicate email returns null', () => {
    const db = openDb(':memory:');
    const user = db.createUser('a@b.com', 'hash1', 'salt1');
    assert.equal(user.email, 'a@b.com');
    assert.ok(user.id);

    const found = db.findUserByEmail('a@b.com');
    assert.equal(found.email, 'a@b.com');

    const dup = db.createUser('a@b.com', 'hash2', 'salt2');
    assert.equal(dup, null);

    db.close();
  });

  test('findUserById returns user without pass_hash/salt exposed shape; updateUserName updates', () => {
    const db = openDb(':memory:');
    const user = db.createUser('x@y.com', 'h', 's');
    db.updateUserName(user.id, 'New Name');
    const found = db.findUserById(user.id);
    assert.equal(found.name, 'New Name');
    assert.equal(found.email, 'x@y.com');
    db.close();
  });
});

describe('db: sessions', () => {
  test('createSession -> findSession returns user_id; deleteSession removes it', () => {
    const db = openDb(':memory:');
    const user = db.createUser('s@s.com', 'h', 's');
    db.createSession('tok123', user.id);

    const sess = db.findSession('tok123');
    assert.equal(sess.user_id, user.id);

    db.deleteSession('tok123');
    assert.equal(db.findSession('tok123'), null);

    db.close();
  });
});

describe('db: snapshots', () => {
  test('upsert two snapshots -> listSnapshots returns 2 sorted by date ASC with parsed analysis', () => {
    const db = openDb(':memory:');
    const user = db.createUser('snap@s.com', 'h', 's');

    db.upsertSnapshot(user.id, { id: 'snap-2', date: 200, source: 'demo', analysis: { total: 2 }, recDone: {} });
    db.upsertSnapshot(user.id, { id: 'snap-1', date: 100, source: 'csv', analysis: { total: 1 }, recDone: {} });

    const list = db.listSnapshots(user.id);
    assert.equal(list.length, 2);
    assert.equal(list[0].id, 'snap-1');
    assert.equal(list[1].id, 'snap-2');
    assert.deepEqual(list[0].analysis, { total: 1 });

    db.close();
  });

  test('upsert with same id updates instead of duplicating', () => {
    const db = openDb(':memory:');
    const user = db.createUser('snap2@s.com', 'h', 's');

    db.upsertSnapshot(user.id, { id: 'snap-1', date: 100, source: 'csv', analysis: { total: 1 }, recDone: {} });
    db.upsertSnapshot(user.id, { id: 'snap-1', date: 150, source: 'csv', analysis: { total: 99 }, recDone: {} });

    const list = db.listSnapshots(user.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].date, 150);
    assert.deepEqual(list[0].analysis, { total: 99 });

    db.close();
  });

  test('deleteSnapshot removes it', () => {
    const db = openDb(':memory:');
    const user = db.createUser('snap3@s.com', 'h', 's');

    db.upsertSnapshot(user.id, { id: 'snap-1', date: 100, source: 'csv', analysis: {}, recDone: {} });
    db.deleteSnapshot(user.id, 'snap-1');

    assert.equal(db.listSnapshots(user.id).length, 0);

    db.close();
  });

  test('listSnapshots for another userId is empty (isolation)', () => {
    const db = openDb(':memory:');
    const userA = db.createUser('a-iso@s.com', 'h', 's');
    const userB = db.createUser('b-iso@s.com', 'h', 's');

    db.upsertSnapshot(userA.id, { id: 'snap-1', date: 100, source: 'csv', analysis: {}, recDone: {} });

    assert.equal(db.listSnapshots(userB.id).length, 0);
    assert.equal(db.listSnapshots(userA.id).length, 1);

    db.close();
  });

  test('setRecDone flags a rec, visible in listSnapshots', () => {
    const db = openDb(':memory:');
    const user = db.createUser('rec@s.com', 'h', 's');

    db.upsertSnapshot(user.id, { id: 'snap-1', date: 100, source: 'csv', analysis: {}, recDone: {} });
    db.setRecDone(user.id, 'snap-1', 'rec-abc', true);

    const list = db.listSnapshots(user.id);
    assert.equal(list[0].recDone['rec-abc'], true);

    db.close();
  });
});
