// test/twitterParsing.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTwitterPosts } from '../lib/twitterParsing.js';

const ROSTER = [{ name: 'Blake', handle: '@codewolf', bio: '' }];
const PSA_ACCOUNTS = [{ name: 'Weyland Alert', handle: '@WeylandAlert' }];

test('parseTwitterPosts extracts a normal post with real stats', () => {
    const raw = '- [@codewolf] just shipped a bug fix at 3am {likes:12 retweets:2 views:340}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
    assert.deepEqual(result.posts[0], {
        authorName: 'Blake', handle: '@codewolf', text: 'just shipped a bug fix at 3am',
        likes: 12, retweets: 2, views: 340, isRetweet: false,
    });
});

test('parseTwitterPosts resolves a PSA account by handle', () => {
    const raw = '- [@WeylandAlert] Water main repair on Elm St, expect delays {likes:3 retweets:5 views:900}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'Weyland Alert');
});

test('parseTwitterPosts falls back to the bare handle for an unrecognized poster', () => {
    const raw = '- [@randomstudent99] first day jitters {likes:4 retweets:0 views:60}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'randomstudent99');
});

test('parseTwitterPosts extracts a retweet with the original poster and text separated out', () => {
    const raw = '- [@codewolf] 🔁 Retweeted from @courtjester: volleyball practice was brutal today {likes:6 retweets:1 views:200}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    const post = result.posts[0];
    assert.equal(post.isRetweet, true);
    assert.equal(post.retweetedFrom, '@courtjester');
    assert.equal(post.retweetedText, 'volleyball practice was brutal today');
    assert.equal(post.text, '');
    assert.equal(post.likes, 6);
});

test('parseTwitterPosts skips unparseable lines gracefully, never throws', () => {
    const raw = 'not a real post line\n## FEED\n- [@codewolf] real post {likes:1 retweets:0 views:10}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
});

test('parseTwitterPosts returns empty posts for empty/garbage/non-string input', () => {
    assert.deepEqual(parseTwitterPosts('', { roster: ROSTER, psaAccounts: PSA_ACCOUNTS }), { posts: [] });
    assert.deepEqual(parseTwitterPosts(null, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS }), { posts: [] });
    assert.deepEqual(parseTwitterPosts('garbage text with no structure', { roster: ROSTER, psaAccounts: PSA_ACCOUNTS }), { posts: [] });
});
