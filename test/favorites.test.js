import test from 'node:test';
import assert from 'node:assert/strict';
import { getFavoriteEntryNames, toggleFavorite, isFavorite } from '../lib/favorites.js';

function makeSettings() {
    return { favoriteContacts: [] };
}

test('getFavoriteEntryNames returns an empty array for a fresh settings object', () => {
    assert.deepEqual(getFavoriteEntryNames(makeSettings()), []);
});

test('toggleFavorite adds an entryName not currently favorited, returning true', () => {
    const settings = makeSettings();
    const result = toggleFavorite(settings, 'Belle');
    assert.equal(result, true);
    assert.deepEqual(getFavoriteEntryNames(settings), ['Belle']);
});

test('toggleFavorite removes an entryName already favorited, returning false', () => {
    const settings = { favoriteContacts: ['Belle'] };
    const result = toggleFavorite(settings, 'Belle');
    assert.equal(result, false);
    assert.deepEqual(getFavoriteEntryNames(settings), []);
});

test('isFavorite reflects current favorited state', () => {
    const settings = { favoriteContacts: ['Belle'] };
    assert.equal(isFavorite(settings, 'Belle'), true);
    assert.equal(isFavorite(settings, 'Blake'), false);
});

test('toggleFavorite does not duplicate an entry if called twice without a remove in between (defensive)', () => {
    const settings = makeSettings();
    toggleFavorite(settings, 'Belle');
    settings.favoriteContacts.push('Belle'); // simulate a corrupted/duplicated state
    toggleFavorite(settings, 'Belle'); // should remove ALL occurrences, not just one
    assert.deepEqual(getFavoriteEntryNames(settings), []);
});
