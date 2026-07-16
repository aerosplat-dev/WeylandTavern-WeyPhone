import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCLUDED_CHARACTER_NAMES } from '../lib/characters.js';

test('EXCLUDED_CHARACTER_NAMES is exactly ["Muse"]', () => {
    assert.deepEqual(EXCLUDED_CHARACTER_NAMES, ['Muse']);
});
