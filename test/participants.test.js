import test from 'node:test';
import assert from 'node:assert/strict';
import { formatParticipantNames, resolveThreadDisplayName } from '../lib/participants.js';

test('formatParticipantNames returns the bare name for a solo conversation', () => {
    assert.equal(formatParticipantNames(['Belle']), 'Belle');
});

test('formatParticipantNames joins two participants with "&"', () => {
    assert.equal(formatParticipantNames(['Belle', 'Blake']), 'Belle & Blake');
});

test('formatParticipantNames joins three participants as "A, B & C"', () => {
    assert.equal(formatParticipantNames(['Belle', 'Blake', 'Ava']), 'Belle, Blake & Ava');
});

test('resolveThreadDisplayName returns the custom displayName when set', () => {
    assert.equal(resolveThreadDisplayName({ displayName: 'Wolf Pack', participants: ['Summer', 'Belle'] }), 'Wolf Pack');
});

test('resolveThreadDisplayName falls back to formatted participants when displayName is null/blank/absent', () => {
    assert.equal(resolveThreadDisplayName({ displayName: null, participants: ['Belle'] }), 'Belle');
    assert.equal(resolveThreadDisplayName({ displayName: '   ', participants: ['Belle'] }), 'Belle');
    assert.equal(resolveThreadDisplayName({ participants: ['Belle', 'Blake'] }), 'Belle & Blake');
});

test('formatParticipantNames shows the first two plus a count for four participants', () => {
    assert.equal(formatParticipantNames(['Belle', 'Blake', 'Ava', 'Rosa']), 'Belle, Blake & 2 more');
});

test('formatParticipantNames shows the first two plus a count for many participants', () => {
    assert.equal(formatParticipantNames(['Belle', 'Blake', 'Ava', 'Rosa', 'Kiera', 'Aiko']), 'Belle, Blake & 4 more');
});

test('formatParticipantNames returns an empty string for an empty list', () => {
    assert.equal(formatParticipantNames([]), '');
});
