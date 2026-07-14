// test/twitterPrompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTwitterPrompt, PSA_ACCOUNTS } from '../lib/twitterPrompts.js';

test('PSA_ACCOUNTS has exactly the 8 operator-specified accounts, excluding Red Lantern/Black Barrel/Mama\'s Den', () => {
    assert.equal(PSA_ACCOUNTS.length, 8);
    const names = PSA_ACCOUNTS.map(a => a.name);
    assert.ok(names.includes('Weyland Alert'));
    assert.ok(names.includes('Kodo Bowl'));
    assert.ok(!names.includes('Red Lantern'));
    assert.ok(!names.includes('Black Barrel'));
    assert.ok(!names.includes("Mama's Den"));
});

test('buildTwitterPrompt feed mode includes the full roster and PSA accounts', () => {
    const prompt = buildTwitterPrompt({ mode: 'feed' });
    assert.match(prompt, /## FEED/);
    assert.ok(prompt.includes('Blake [@codewolf]'));
    assert.ok(prompt.includes('Weyland Alert [@WeylandAlert]'));
    assert.match(prompt, /should NOT dominate/i);
});

test('buildTwitterPrompt profile mode scopes to exactly one character', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- Punk wolfgirl, computer science major' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /## POSTS/);
    assert.ok(prompt.includes('Blake [@codewolf]'));
    assert.ok(prompt.includes('- Punk wolfgirl, computer science major'));
    assert.doesNotMatch(prompt, /Kai \[@breakingthecycle\]/);
    assert.doesNotMatch(prompt, /Weyland Alert/);
});

test('buildTwitterPrompt profile mode mentions retweets are acceptable', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /retweet/i);
});

test('buildTwitterPrompt feed mode instructs the stat-block format', () => {
    const prompt = buildTwitterPrompt({ mode: 'feed' });
    assert.match(prompt, /\{likes:N retweets:N views:N\}/);
    assert.match(prompt, /standalone posts/i);
});

test('buildTwitterPrompt profile mode instructs the stat-block format and standalone-posts flavor', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /\{likes:N retweets:N views:N\}/);
    assert.match(prompt, /standalone posts/i);
});

test('buildTwitterPrompt does not contain the old contradicting retweet-format instruction, in either mode', () => {
    const feedPrompt = buildTwitterPrompt({ mode: 'feed' });
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const profilePrompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.doesNotMatch(feedPrompt, /no special formatting needed/i);
    assert.doesNotMatch(profilePrompt, /no special formatting needed/i);
});
