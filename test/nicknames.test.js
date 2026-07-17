import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_USER_NICKNAMES, validateNicknamePools, parseNicknameTags } from '../lib/nicknames.js';
import { migrateNicknameFields } from '../lib/storage.js';

test('BUILT_IN_USER_NICKNAMES is exactly the three spec defaults', () => {
    assert.deepEqual(BUILT_IN_USER_NICKNAMES, ['juicebox', 'pookie', 'wolfmeat']);
});

test('validateNicknamePools passes when the pools are disjoint', () => {
    const result = validateNicknamePools(['juicebox', 'pookie'], { Blake: 'wolfy', Rosa: 'red' });
    assert.deepEqual(result, { valid: true, conflicts: [] });
});

test('validateNicknamePools flags a string shared by both pools (case-insensitive)', () => {
    const result = validateNicknamePools(['juicebox', 'Pookie'], { Blake: 'POOKIE' });
    assert.equal(result.valid, false);
    assert.deepEqual(result.conflicts, ['POOKIE']);
});

test('validateNicknamePools ignores blank/non-string character nicknames', () => {
    const result = validateNicknamePools(['juicebox'], { Blake: '', Rosa: '   ', Ava: null });
    assert.deepEqual(result, { valid: true, conflicts: [] });
});

test('validateNicknamePools tolerates undefined pools', () => {
    assert.deepEqual(validateNicknamePools(undefined, undefined), { valid: true, conflicts: [] });
});

test('parseNicknameTags splits, trims, and drops empties', () => {
    assert.deepEqual(parseNicknameTags(' juicebox , pookie ,, wolfmeat , '), ['juicebox', 'pookie', 'wolfmeat']);
});

test('parseNicknameTags returns [] for a non-string', () => {
    assert.deepEqual(parseNicknameTags(null), []);
    assert.deepEqual(parseNicknameTags(42), []);
});

test('migrateNicknameFields seeds all three built-ins into an empty pool', () => {
    const settings = {};
    migrateNicknameFields(settings);
    assert.deepEqual(settings.userNicknames, ['juicebox', 'pookie', 'wolfmeat']);
    assert.deepEqual(settings.characterNicknames, {});
});

test('migrateNicknameFields adds only MISSING built-ins and keeps user additions (case-insensitive)', () => {
    const settings = { userNicknames: ['Juicebox', 'sweetpea'], characterNicknames: { Blake: 'wolfy' } };
    migrateNicknameFields(settings);
    // "Juicebox" already present (case-insensitive) so not duplicated; pookie/wolfmeat appended.
    assert.deepEqual(settings.userNicknames, ['Juicebox', 'sweetpea', 'pookie', 'wolfmeat']);
    assert.deepEqual(settings.characterNicknames, { Blake: 'wolfy' });
});

test('migrateNicknameFields repairs a non-array/non-object shape and is idempotent', () => {
    const settings = { userNicknames: 'oops', characterNicknames: ['bad'] };
    migrateNicknameFields(settings);
    assert.deepEqual(settings.userNicknames, ['juicebox', 'pookie', 'wolfmeat']);
    assert.deepEqual(settings.characterNicknames, {});
    const snapshot = JSON.parse(JSON.stringify(settings));
    migrateNicknameFields(settings);
    assert.deepEqual(settings, snapshot); // second run changes nothing
});
