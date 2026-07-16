import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReply, parseGroupReply } from '../lib/messageParsing.js';

test('parseReply extracts a single Incoming line after an analysis block', () => {
    const raw = '<analysis>reasoning here</analysis>\nIncoming¦3:47 PM¦Rosa¦hey whats up';
    assert.deepEqual(parseReply(raw), { messages: ['hey whats up'], usedFallback: false });
});

test('parseReply extracts multiple Incoming lines in order, discarding Phone/Texting headers', () => {
    const raw = '<analysis>x</analysis>\nPhone¦Weynet - Tim¦76%\nTexting¦Rosa\nIncoming¦3:47 PM¦Rosa¦first\nIncoming¦3:48 PM¦Rosa¦second';
    assert.deepEqual(parseReply(raw), { messages: ['first', 'second'], usedFallback: false });
});

test('parseReply works with no analysis block present at all', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey';
    assert.deepEqual(parseReply(raw), { messages: ['hey'], usedFallback: false });
});

test('parseReply strips a trailing footer line of bracketed tokens', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Rosa¦hey\n[Amusement] [RC]';
    assert.deepEqual(parseReply(raw), { messages: ['hey'], usedFallback: false });
});

test('parseReply discards narration and Outgoing lines, keeping only Incoming lines', () => {
    const raw = '<analysis>x</analysis>\n*she hesitates*\nIncoming¦3:47 PM¦Rosa¦hey\nOutgoing¦3:48 PM¦Tim¦hi back\nIncoming¦3:49 PM¦Rosa¦you there?';
    assert.deepEqual(parseReply(raw), { messages: ['hey', 'you there?'], usedFallback: false });
});

test('parseReply falls back to the cleaned remainder as one message when no Incoming lines are found', () => {
    const raw = '<analysis>x</analysis>\nRosa walks into the room and smiles at you.';
    assert.deepEqual(parseReply(raw), { messages: ['Rosa walks into the room and smiles at you.'], usedFallback: true });
});

test('parseReply returns no messages when the analysis block is never closed', () => {
    const raw = '<analysis>reasoning that got cut off mid-stream';
    assert.deepEqual(parseReply(raw), { messages: [], usedFallback: false });
});

test('parseReply returns no messages when nothing remains after stripping', () => {
    const raw = '<analysis>x</analysis>\n   \n';
    assert.deepEqual(parseReply(raw), { messages: [], usedFallback: false });
});

test('parseReply skips an Incoming line whose message field is empty', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Rosa¦\nIncoming¦3:48 PM¦Rosa¦real message';
    assert.deepEqual(parseReply(raw), { messages: ['real message'], usedFallback: false });
});

test('parseReply normalizes CRLF line endings before matching Incoming lines', () => {
    const raw = '<analysis>x</analysis>\r\nIncoming¦3:47 PM¦Rosa¦hey\r\nIncoming¦3:48 PM¦Rosa¦there';
    assert.deepEqual(parseReply(raw), { messages: ['hey', 'there'], usedFallback: false });
});

test('parseReply degrades gracefully (no throw) for null/undefined input, matching the "nothing usable survives" convention', () => {
    assert.deepEqual(parseReply(null), { messages: [], usedFallback: false });
    assert.deepEqual(parseReply(undefined), { messages: [], usedFallback: false });
});

test('parseReply behavior is unchanged after the preprocessReplyLines refactor (regression guard)', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Rosa¦first\nIncoming¦3:48 PM¦Rosa¦second';
    assert.deepEqual(parseReply(raw), { messages: ['first', 'second'], usedFallback: false });
});

test('parseGroupReply extracts each Incoming line with its own speaker name', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Nathan¦hey\nIncoming¦3:48 PM¦Emily¦sup';
    assert.deepEqual(parseGroupReply(raw), {
        messages: [
            { speaker: 'Nathan', content: 'hey' },
            { speaker: 'Emily', content: 'sup' },
        ],
        usedFallback: false,
    });
});

test('parseGroupReply does NOT mistake an Incoming-shaped line inside the analysis block for a real message (phantom-message regression guard)', () => {
    const raw = '<analysis>\nNathan should say something like:\nIncoming¦3:47 PM¦Nathan¦fake\nbut only in the real reply below\n</analysis>\nIncoming¦3:50 PM¦Nathan¦the real one';
    assert.deepEqual(parseGroupReply(raw), {
        messages: [{ speaker: 'Nathan', content: 'the real one' }],
        usedFallback: false,
    });
});

test('parseGroupReply falls back to a single speaker-less message when no Incoming lines are found, instead of silently losing the reply (silent-data-loss regression guard)', () => {
    const raw = '<analysis>x</analysis>\nNathan just stares at his phone, unsure what to say.';
    assert.deepEqual(parseGroupReply(raw), {
        messages: [{ speaker: null, content: 'Nathan just stares at his phone, unsure what to say.' }],
        usedFallback: true,
    });
});

test('parseGroupReply strips a trailing footer line the same way parseReply does', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Nathan¦hey\n[Amusement] [RC]';
    assert.deepEqual(parseGroupReply(raw), {
        messages: [{ speaker: 'Nathan', content: 'hey' }],
        usedFallback: false,
    });
});

test('parseGroupReply returns no messages when the analysis block is never closed, same as parseReply', () => {
    const raw = '<analysis>reasoning that got cut off mid-stream';
    assert.deepEqual(parseGroupReply(raw), { messages: [], usedFallback: false });
});
