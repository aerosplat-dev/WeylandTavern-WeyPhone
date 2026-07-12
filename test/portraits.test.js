import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortraitMap } from '../lib/portraits.js';

function fakeGetThumbnailUrl(type, file) {
    return `/thumbnail?type=${type}&file=${file}`;
}

test('buildPortraitMap resolves a real character to its avatar URL with no fallback initial', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Rosa'], fakeGetThumbnailUrl);
    assert.deepEqual(map.Rosa, { avatarUrl: '/thumbnail?type=avatar&file=rosa.png', initial: null });
});

test('buildPortraitMap falls back to an uppercase initial when the character cannot be found', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Deleted Character'], fakeGetThumbnailUrl);
    assert.deepEqual(map['Deleted Character'], { avatarUrl: null, initial: 'D' });
});

test('buildPortraitMap resolves multiple char names independently', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }, { name: 'Ava', avatar: 'ava.png' }];
    const map = buildPortraitMap(characters, ['Rosa', 'Ava'], fakeGetThumbnailUrl);
    assert.equal(map.Rosa.avatarUrl, '/thumbnail?type=avatar&file=rosa.png');
    assert.equal(map.Ava.avatarUrl, '/thumbnail?type=avatar&file=ava.png');
});

test('buildPortraitMap deduplicates repeated char names without extra work', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Rosa', 'Rosa', 'Rosa'], fakeGetThumbnailUrl);
    assert.equal(Object.keys(map).length, 1);
});

test('buildPortraitMap returns an empty map for an empty charNames list', () => {
    assert.deepEqual(buildPortraitMap([{ name: 'Rosa', avatar: 'rosa.png' }], [], fakeGetThumbnailUrl), {});
});

test('buildPortraitMap does not throw on an undefined charName and falls back to an empty initial', () => {
    const map = buildPortraitMap([{ name: 'Rosa', avatar: 'rosa.png' }], [undefined], fakeGetThumbnailUrl);
    assert.deepEqual(map[undefined], { avatarUrl: null, initial: '' });
});
