import test from 'node:test';
import assert from 'node:assert/strict';
import { formatParticipantNames } from '../lib/participants.js';

test('formatParticipantNames returns the bare name for a solo conversation', () => {
    assert.equal(formatParticipantNames(['Belle']), 'Belle');
});

test('formatParticipantNames joins two participants with "&"', () => {
    assert.equal(formatParticipantNames(['Belle', 'Blake']), 'Belle & Blake');
});

test('formatParticipantNames joins three participants as "A, B & C"', () => {
    assert.equal(formatParticipantNames(['Belle', 'Blake', 'Ava']), 'Belle, Blake & Ava');
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
