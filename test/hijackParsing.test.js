import test from 'node:test';
import assert from 'node:assert/strict';
import { locatePhoneBlock, stripPhoneBlock } from '../lib/hijackParsing.js';

test('locatePhoneBlock finds a solo run with a Phone header (¦ U+00A6)', () => {
    const raw = 'Phone¦Weynet¦82%\nIncoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦you there?';
    const block = locatePhoneBlock(raw);
    assert.equal(block.headerLine, 'Phone¦Weynet¦82%');
    assert.deepEqual(block.lines, [
        { role: 'assistant', speaker: 'Rosa', text: 'hey' },
        { role: 'assistant', speaker: 'Rosa', text: 'you there?' },
    ]);
    assert.equal(block.startIndex, 0);
    assert.equal(block.endIndex, 2);
});

test('locatePhoneBlock finds a Texting header and preserves Outgoing as role user', () => {
    const raw = 'Texting¦Rosa\nOutgoing¦3:46 PM¦Tim¦on my way\nIncoming¦3:47 PM¦Rosa¦ok';
    const block = locatePhoneBlock(raw);
    assert.equal(block.headerLine, 'Texting¦Rosa');
    assert.deepEqual(block.lines, [
        { role: 'user', text: 'on my way' },
        { role: 'assistant', speaker: 'Rosa', text: 'ok' },
    ]);
});

test('locatePhoneBlock handles the ASCII pipe delimiter', () => {
    const raw = 'Incoming|3:47 PM|Rosa|hey there';
    const block = locatePhoneBlock(raw);
    assert.equal(block.headerLine, null);
    assert.deepEqual(block.lines, [{ role: 'assistant', speaker: 'Rosa', text: 'hey there' }]);
    assert.equal(block.startIndex, 0);
    assert.equal(block.endIndex, 0);
});

test('locatePhoneBlock handles the box-drawing delimiter (│ U+2502)', () => {
    const raw = 'Incoming│3:47 PM│Rosa│hey there';
    const block = locatePhoneBlock(raw);
    assert.deepEqual(block.lines, [{ role: 'assistant', speaker: 'Rosa', text: 'hey there' }]);
});

test('locatePhoneBlock captures a block surrounded by narrative prose', () => {
    const raw = 'She pulls out her phone.\n\nIncoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦come over\n\nShe sets it down.';
    const block = locatePhoneBlock(raw);
    assert.equal(block.headerLine, null);
    assert.equal(block.startIndex, 2);
    assert.equal(block.endIndex, 3);
    assert.deepEqual(block.lines, [
        { role: 'assistant', speaker: 'Rosa', text: 'hey' },
        { role: 'assistant', speaker: 'Rosa', text: 'come over' },
    ]);
});

test('locatePhoneBlock captures multiple distinct speakers (group)', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:47 PM¦Belle¦hi\nIncoming¦3:48 PM¦Rosa¦come to the barrel';
    const block = locatePhoneBlock(raw);
    assert.deepEqual(block.lines.map(l => l.speaker), ['Rosa', 'Belle', 'Rosa']);
});

test('locatePhoneBlock picks the single longest run when two runs exist', () => {
    const raw = 'Incoming¦1¦Rosa¦a\n\nnarrative\n\nIncoming¦2¦Rosa¦b\nIncoming¦3¦Rosa¦c';
    const block = locatePhoneBlock(raw);
    assert.deepEqual(block.lines.map(l => l.text), ['b', 'c']);
    assert.equal(block.startIndex, 4);
    assert.equal(block.endIndex, 5);
});

test('locatePhoneBlock returns null when there are no phone lines at all', () => {
    assert.equal(locatePhoneBlock('Just ordinary narration with no texting.'), null);
});

test('locatePhoneBlock returns null for null/non-string input', () => {
    assert.equal(locatePhoneBlock(null), null);
    assert.equal(locatePhoneBlock(undefined), null);
    assert.equal(locatePhoneBlock(42), null);
});

test('locatePhoneBlock treats a malformed/partial line as a run boundary', () => {
    // "Incoming¦3:47 PM¦Rosa" has only 2 delimiters (missing the final ¦text) -> not a phone line.
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:47 PM¦Rosa\nIncoming¦3:49 PM¦Rosa¦later';
    const block = locatePhoneBlock(raw);
    // Two runs of length 1 each; the first wins on the tie.
    assert.deepEqual(block.lines, [{ role: 'assistant', speaker: 'Rosa', text: 'hey' }]);
    assert.equal(block.startIndex, 0);
    assert.equal(block.endIndex, 0);
});

test('locatePhoneBlock does not attach a header that is not immediately adjacent', () => {
    const raw = 'Phone¦Weynet¦82%\n\nIncoming¦3:47 PM¦Rosa¦hey';
    const block = locatePhoneBlock(raw);
    // A blank line sits between the header and the run, so the header is NOT captured.
    assert.equal(block.headerLine, null);
    assert.equal(block.startIndex, 2);
});

test('stripPhoneBlock removes the block and collapses surrounding blanks, leaving prose intact', () => {
    const raw = 'She pulls out her phone.\n\nIncoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦come over\n\nShe sets it down.';
    const block = locatePhoneBlock(raw);
    assert.equal(stripPhoneBlock(raw, block), 'She pulls out her phone.\n\nShe sets it down.');
});

test('stripPhoneBlock removes the header line too, leaving no orphan', () => {
    const raw = 'Before.\nPhone¦Weynet¦82%\nIncoming¦3:47 PM¦Rosa¦hey\nAfter.';
    const block = locatePhoneBlock(raw);
    assert.equal(stripPhoneBlock(raw, block), 'Before.\nAfter.');
});

test('stripPhoneBlock trims a leading blank line when the block was at the very top', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\n\nShe smiles.';
    const block = locatePhoneBlock(raw);
    assert.equal(stripPhoneBlock(raw, block), 'She smiles.');
});

test('stripPhoneBlock returns empty string when the whole message was the block', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦there';
    const block = locatePhoneBlock(raw);
    assert.equal(stripPhoneBlock(raw, block), '');
});
