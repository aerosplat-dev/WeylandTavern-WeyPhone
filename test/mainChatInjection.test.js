import test from 'node:test';
import assert from 'node:assert/strict';
import {
    selectInjectableContent,
    anchorToDepth,
    groupInjectableItemsByAnchor,
    buildMainChatInjectionPlan,
    planTetherExtensionPromptOps,
    TETHER_CAUTION_BLOCK,
} from '../lib/mainChatInjection.js';
import { fakeFormatClockTime as formatClockTime } from './helpers.js';

const POS = { cautionKey: 'weyphone_tether_caution', positionInPrompt: 0, positionInChat: 1, positionNone: -1, roleSystem: 0, roleUser: 1 };

test('selectInjectableContent returns pinned memories and messages since lastMemoryMessageIndex', () => {
    const conversation = {
        memories: [
            { id: 'm1', content: 'pinned one', pinned: true, mainChatAnchor: 2 },
            { id: 'm2', content: 'unpinned one', pinned: false, mainChatAnchor: 3 },
        ],
        messages: [
            { role: 'user', content: 'old', mainChatAnchor: 1 },
            { role: 'assistant', content: 'recent one', mainChatAnchor: 5 },
            { role: 'user', content: 'recent two', mainChatAnchor: 6 },
        ],
        lastMemoryMessageIndex: 1,
    };
    const { pinnedMemories, recentMessages } = selectInjectableContent(conversation);
    assert.deepEqual(pinnedMemories.map(m => m.id), ['m1']);
    assert.deepEqual(recentMessages.map(m => m.content), ['recent one', 'recent two']);
});

test('selectInjectableContent defaults lastMemoryMessageIndex to 0 when absent', () => {
    const conversation = {
        memories: [],
        messages: [{ role: 'user', content: 'a', mainChatAnchor: 1 }],
    };
    const { recentMessages } = selectInjectableContent(conversation);
    assert.deepEqual(recentMessages.map(m => m.content), ['a']);
});

test('anchorToDepth converts an anchor into messages-back-from-the-end', () => {
    assert.equal(anchorToDepth(10, 15), 5);
});

test('anchorToDepth clamps at 0 when the anchor is not older than the current chat length', () => {
    assert.equal(anchorToDepth(15, 15), 0);
    assert.equal(anchorToDepth(20, 15), 0);
});

test('anchorToDepth returns 0 for a null (unanchored) anchor', () => {
    assert.equal(anchorToDepth(null, 15), 0);
});

test('groupInjectableItemsByAnchor groups a single conversation\'s items by anchor value', () => {
    const conversation = {
        id: 'conv1',
        participants: ['Blake'],
        memories: [{ id: 'm1', content: 'summary', pinned: true, mainChatAnchor: 2 }],
        messages: [
            { role: 'assistant', content: 'hey', mainChatAnchor: 5 },
            { role: 'user', content: 'hi', mainChatAnchor: 5 },
            { role: 'assistant', content: 'later', mainChatAnchor: 9 },
        ],
        lastMemoryMessageIndex: 0,
    };
    const groups = groupInjectableItemsByAnchor([conversation]);
    assert.equal(groups.length, 3);
    const byAnchor = Object.fromEntries(groups.map(g => [g.anchor, g]));
    assert.equal(byAnchor[2].memories.length, 1);
    assert.equal(byAnchor[5].messages.length, 2);
    assert.equal(byAnchor[9].messages.length, 1);
    assert.deepEqual(byAnchor[5].participants, ['Blake']);
});

test('groupInjectableItemsByAnchor keeps two different conversations that share an anchor as separate groups', () => {
    const convA = {
        id: 'convA', participants: ['Blake'], lastMemoryMessageIndex: 0, memories: [],
        messages: [{ role: 'user', content: 'a', mainChatAnchor: 4 }],
    };
    const convB = {
        id: 'convB', participants: ['Rosa'], lastMemoryMessageIndex: 0, memories: [],
        messages: [{ role: 'user', content: 'b', mainChatAnchor: 4 }],
    };
    const groups = groupInjectableItemsByAnchor([convA, convB]);
    assert.equal(groups.length, 2);
    const convIds = groups.map(g => g.conversationId).sort();
    assert.deepEqual(convIds, ['convA', 'convB']);
});

test('groupInjectableItemsByAnchor buckets unanchored (null mainChatAnchor) items together per conversation', () => {
    const conversation = {
        id: 'conv1', participants: ['Blake'], lastMemoryMessageIndex: 0, memories: [],
        messages: [
            { role: 'user', content: 'a', mainChatAnchor: null },
            { role: 'assistant', content: 'b' },
        ],
    };
    const groups = groupInjectableItemsByAnchor([conversation]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].anchor, null);
    assert.equal(groups[0].messages.length, 2);
});

test('buildMainChatInjectionPlan returns no caution block and no groups when nothing is injectable', () => {
    const plan = buildMainChatInjectionPlan({ tetheredConversations: [], currentMainChatLength: 10, userName: 'User', formatClockTime });
    assert.equal(plan.cautionBlock, null);
    assert.deepEqual(plan.groups, []);
});

test('buildMainChatInjectionPlan builds one keyed, depth-positioned block per group plus the shared caution', () => {
    const conversation = {
        id: 'conv1', participants: ['Blake'], lastMemoryMessageIndex: 0,
        memories: [],
        messages: [
            { role: 'user', content: 'meet me at the Black Barrel', mainChatAnchor: 8, timestamp: 1000 },
            { role: 'assistant', content: 'see you there', speaker: 'Blake', mainChatAnchor: 8, timestamp: 2000 },
        ],
    };
    const plan = buildMainChatInjectionPlan({
        tetheredConversations: [conversation],
        currentMainChatLength: 12,
        userName: 'Alex',
        formatClockTime,
    });
    assert.equal(plan.cautionBlock, TETHER_CAUTION_BLOCK);
    assert.equal(plan.groups.length, 1);
    const group = plan.groups[0];
    assert.equal(group.depth, 4);
    assert.equal(group.key, 'weyphone_tether_conv1_8');
    assert.match(group.content, /\*I take a moment to exchange some text messages with Blake\.\*/);
    assert.match(group.content, /Black Barrel/);
    assert.doesNotMatch(group.content, /\[TEXT MESSAGES/);
});

test('buildMainChatInjectionPlan composes the asterisk-narration lead-in via formatParticipantNames for multi-participant groups', () => {
    const conversation = {
        id: 'conv1', participants: ['Blake', 'Rosa'], lastMemoryMessageIndex: 0, memories: [],
        messages: [{ role: 'user', content: 'hi both', mainChatAnchor: 3, timestamp: 1000 }],
    };
    const plan = buildMainChatInjectionPlan({
        tetheredConversations: [conversation],
        currentMainChatLength: 5,
        userName: 'Alex',
        formatClockTime,
    });
    assert.match(plan.groups[0].content, /\*I take a moment to exchange some text messages with Blake & Rosa\.\*/);
});

test('buildMainChatInjectionPlan uses "unanchored" in the key for a null-anchor group', () => {
    const conversation = {
        id: 'conv1', participants: ['Blake'], lastMemoryMessageIndex: 0, memories: [],
        messages: [{ role: 'user', content: 'hi', mainChatAnchor: null, timestamp: 1000 }],
    };
    const plan = buildMainChatInjectionPlan({
        tetheredConversations: [conversation],
        currentMainChatLength: 5,
        userName: 'Alex',
        formatClockTime,
    });
    assert.equal(plan.groups[0].key, 'weyphone_tether_conv1_unanchored');
    assert.equal(plan.groups[0].depth, 0);
});

test('buildMainChatInjectionPlan tags a memory-derived line using the real, current Weyland-LTM [MEMORY ENTRY] bracket convention', () => {
    const conversation = {
        id: 'conv1', participants: ['Blake'], lastMemoryMessageIndex: 5,
        memories: [{ id: 'm1', content: 'They agreed to meet up later.', pinned: true, mainChatAnchor: 3 }],
        messages: [],
    };
    const plan = buildMainChatInjectionPlan({
        tetheredConversations: [conversation],
        currentMainChatLength: 10,
        userName: 'Alex',
        formatClockTime,
    });
    assert.match(plan.groups[0].content, /\[MEMORY ENTRY\]\nThey agreed to meet up later\.\n\[END MEMORY ENTRY\]/);
});

test('buildMainChatInjectionPlan interleaves two threads with different anchors into separate, correctly-depth-ordered groups', () => {
    const convA = {
        id: 'convA', participants: ['Blake'], lastMemoryMessageIndex: 0, memories: [],
        messages: [{ role: 'user', content: 'early text', mainChatAnchor: 2, timestamp: 1 }],
    };
    const convB = {
        id: 'convB', participants: ['Rosa'], lastMemoryMessageIndex: 0, memories: [],
        messages: [{ role: 'user', content: 'later text', mainChatAnchor: 9, timestamp: 2 }],
    };
    const plan = buildMainChatInjectionPlan({
        tetheredConversations: [convA, convB],
        currentMainChatLength: 10,
        userName: 'Alex',
        formatClockTime,
    });
    assert.equal(plan.groups.length, 2);
    const byKey = Object.fromEntries(plan.groups.map(g => [g.key, g]));
    assert.equal(byKey['weyphone_tether_convA_2'].depth, 8);
    assert.equal(byKey['weyphone_tether_convB_9'].depth, 1);
});

test('planTetherExtensionPromptOps emits set ops for the caution block and each group, tracking their keys', () => {
    const plan = {
        cautionBlock: 'CAUTION',
        groups: [
            { key: 'weyphone_tether_convA_0', depth: 0, content: 'A' },
            { key: 'weyphone_tether_convB_3', depth: 3, content: 'B' },
        ],
    };
    const { ops, nextKeys } = planTetherExtensionPromptOps(plan, new Set(), POS);
    assert.deepEqual(ops, [
        { key: 'weyphone_tether_caution', content: 'CAUTION', position: 0, depth: 0, role: 0 },
        { key: 'weyphone_tether_convA_0', content: 'A', position: 1, depth: 0, role: 1 },
        { key: 'weyphone_tether_convB_3', content: 'B', position: 1, depth: 3, role: 1 },
    ]);
    assert.deepEqual([...nextKeys].sort(), ['weyphone_tether_caution', 'weyphone_tether_convA_0', 'weyphone_tether_convB_3']);
});

test('planTetherExtensionPromptOps clears every previously-set key when the new plan is empty (reversibility)', () => {
    // Regression: turning the feature off (or leaving the main chat) yields an empty plan; every
    // key set on a prior generation must be explicitly cleared, or stale injections linger in ST's
    // extension_prompts and keep bleeding into generations after the feature is off.
    const emptyPlan = { cautionBlock: null, groups: [] };
    const previousKeys = new Set(['weyphone_tether_caution', 'weyphone_tether_convA_0']);
    const { ops, nextKeys } = planTetherExtensionPromptOps(emptyPlan, previousKeys, POS);
    assert.deepEqual(ops, [
        { key: 'weyphone_tether_caution', content: '', position: -1, depth: 0, role: 0 },
        { key: 'weyphone_tether_convA_0', content: '', position: -1, depth: 0, role: 0 },
    ]);
    assert.equal(nextKeys.size, 0);
});

test('planTetherExtensionPromptOps clears only the keys that dropped out of the new plan', () => {
    const plan = {
        cautionBlock: 'CAUTION',
        groups: [{ key: 'weyphone_tether_convA_0', depth: 0, content: 'A' }],
    };
    const previousKeys = new Set(['weyphone_tether_caution', 'weyphone_tether_convA_0', 'weyphone_tether_convB_3']);
    const { ops, nextKeys } = planTetherExtensionPromptOps(plan, previousKeys, POS);
    assert.deepEqual(ops, [
        { key: 'weyphone_tether_caution', content: 'CAUTION', position: 0, depth: 0, role: 0 },
        { key: 'weyphone_tether_convA_0', content: 'A', position: 1, depth: 0, role: 1 },
        { key: 'weyphone_tether_convB_3', content: '', position: -1, depth: 0, role: 0 },
    ]);
    assert.deepEqual([...nextKeys].sort(), ['weyphone_tether_caution', 'weyphone_tether_convA_0']);
});

test('planTetherExtensionPromptOps is a no-op when the plan is empty and nothing was set before', () => {
    const { ops, nextKeys } = planTetherExtensionPromptOps({ cautionBlock: null, groups: [] }, new Set(), POS);
    assert.deepEqual(ops, []);
    assert.equal(nextKeys.size, 0);
});
