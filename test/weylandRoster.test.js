// test/weylandRoster.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { WEYLAND_ROSTER, TWITTER_ONLY_ROSTER } from "../lib/weylandRoster.js";

test("WEYLAND_ROSTER has exactly 31 characters", () => {
    assert.equal(WEYLAND_ROSTER.length, 31);
});

test("TWITTER_ONLY_ROSTER has exactly the 2 confirmed non-student accounts (Navine, Bastet)", () => {
    assert.equal(TWITTER_ONLY_ROSTER.length, 2);
    const names = TWITTER_ONLY_ROSTER.map(c => c.name);
    assert.ok(names.includes('Navine'));
    assert.ok(names.includes('Bastet'));
});

test("TWITTER_ONLY_ROSTER entries have a name, handle, and non-empty bio, same shape as WEYLAND_ROSTER", () => {
    for (const c of TWITTER_ONLY_ROSTER) {
        assert.ok(c.name && c.name.length > 0);
        assert.ok(c.handle && c.handle.startsWith("@"));
        assert.ok(c.bio && c.bio.length > 0);
    }
});

test("TWITTER_ONLY_ROSTER members are NOT present in WEYLAND_ROSTER (kept strictly separate)", () => {
    const rosterNames = new Set(WEYLAND_ROSTER.map(c => c.name));
    for (const c of TWITTER_ONLY_ROSTER) {
        assert.ok(!rosterNames.has(c.name));
    }
});

test("every roster entry has a name, handle, and non-empty bio", () => {
    for (const c of WEYLAND_ROSTER) {
        assert.ok(c.name && c.name.length > 0);
        assert.ok(c.handle && c.handle.startsWith("@"));
        assert.ok(c.bio && c.bio.length > 0);
    }
});

