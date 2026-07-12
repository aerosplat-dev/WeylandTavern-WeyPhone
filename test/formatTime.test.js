import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRelativeTime } from '../lib/formatTime.js';

// Fixed reference "now": July 11, 2026, 3:30:00 PM local time.
const NOW = new Date(2026, 6, 11, 15, 30, 0).getTime();

test('formatRelativeTime returns an empty string for falsy input', () => {
    assert.equal(formatRelativeTime(0, NOW), '');
    assert.equal(formatRelativeTime(null, NOW), '');
    assert.equal(formatRelativeTime(undefined, NOW), '');
});

test('formatRelativeTime returns "Just now" for under a minute ago', () => {
    const ts = NOW - 30 * 1000;
    assert.equal(formatRelativeTime(ts, NOW), 'Just now');
});

test('formatRelativeTime returns minutes for under an hour ago, same calendar day', () => {
    const ts = NOW - 5 * 60 * 1000;
    assert.equal(formatRelativeTime(ts, NOW), '5m');
});

test('formatRelativeTime returns hours for same calendar day, an hour or more ago', () => {
    const ts = new Date(2026, 6, 11, 12, 0, 0).getTime(); // same day, earlier
    assert.equal(formatRelativeTime(ts, NOW), '3h');
});

test('formatRelativeTime returns "Yesterday" for the previous calendar day, regardless of time', () => {
    const ts = new Date(2026, 6, 10, 23, 0, 0).getTime();
    assert.equal(formatRelativeTime(ts, NOW), 'Yesterday');
});

test('formatRelativeTime returns "Mon D" for an older date within the same year', () => {
    const ts = new Date(2026, 6, 1, 9, 0, 0).getTime();
    assert.equal(formatRelativeTime(ts, NOW), 'Jul 1');
});

test('formatRelativeTime returns "Mon D, YYYY" for a date in a different year', () => {
    const ts = new Date(2025, 11, 25, 9, 0, 0).getTime();
    assert.equal(formatRelativeTime(ts, NOW), 'Dec 25, 2025');
});

test('formatRelativeTime defaults now to Date.now() when not provided', () => {
    const justNow = Date.now() - 1000;
    assert.equal(formatRelativeTime(justNow), 'Just now');
});
