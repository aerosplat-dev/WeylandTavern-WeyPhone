import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortraitMap } from '../lib/portraits.js';

function fakeGetThumbnailUrl(type, file) {
    return `/thumbnail?type=${type}&file=${file}`;
}

test('buildPortraitMap resolves both a weybooru primary URL and a local fallback for a known character', () => {
    const characters = [{ name: 'Blake', avatar: 'blake.png' }];
    const getThumbnailUrl = (type, file) => `/thumbnail/${type}/${file}`;
    const map = buildPortraitMap(characters, ['Blake'], getThumbnailUrl);
    assert.equal(map.Blake.primaryUrl, 'https://cast.weybooru.com/images/portraits/blake.jpg');
    assert.equal(map.Blake.fallbackUrl, '/thumbnail/avatar/blake.png');
    assert.equal(map.Blake.initial, null);
});

test('buildPortraitMap lowercases multi-word... single-token names correctly for the weybooru URL', () => {
    const characters = [{ name: 'Kris', avatar: 'kris.png' }];
    const getThumbnailUrl = (type, file) => `/thumbnail/${type}/${file}`;
    const map = buildPortraitMap(characters, ['Kris'], getThumbnailUrl);
    assert.equal(map.Kris.primaryUrl, 'https://cast.weybooru.com/images/portraits/kris.jpg');
});

test('buildPortraitMap falls back to initial-only for an unknown/deleted character', () => {
    const map = buildPortraitMap([], ['Ghost'], () => '/x');
    assert.equal(map.Ghost.primaryUrl, null);
    assert.equal(map.Ghost.fallbackUrl, null);
    assert.equal(map.Ghost.initial, 'G');
});

test('buildPortraitMap falls back to an uppercase initial when the character cannot be found', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Deleted Character'], fakeGetThumbnailUrl);
    assert.deepEqual(map['Deleted Character'], { primaryUrl: null, fallbackUrl: null, initial: 'D' });
});

test('buildPortraitMap resolves multiple char names independently', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }, { name: 'Ava', avatar: 'ava.png' }];
    const map = buildPortraitMap(characters, ['Rosa', 'Ava'], fakeGetThumbnailUrl);
    assert.equal(map.Rosa.primaryUrl, 'https://cast.weybooru.com/images/portraits/rosa.jpg');
    assert.equal(map.Rosa.fallbackUrl, '/thumbnail?type=avatar&file=rosa.png');
    assert.equal(map.Ava.primaryUrl, 'https://cast.weybooru.com/images/portraits/ava.jpg');
    assert.equal(map.Ava.fallbackUrl, '/thumbnail?type=avatar&file=ava.png');
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
    assert.deepEqual(map[undefined], { primaryUrl: null, fallbackUrl: null, initial: '' });
});
