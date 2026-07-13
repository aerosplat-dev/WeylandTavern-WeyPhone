// test/phoneCommand.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhoneCommand } from '../lib/phoneCommand.js';

test('runPhoneCommand pushes the command message onto chat, calls generate, and returns its result', async () => {
    const chat = [{ is_user: true, name: 'Ava', mes: 'earlier real message', send_date: 1 }];
    let capturedChatAtGenerateTime = null;
    const fakeGenerate = async (type, options) => {
        assert.equal(type, 'quiet');
        // Snapshot chat's length+last entry AT THE MOMENT generate is called — this is the real
        // assertion that the push happened before generate, not after.
        capturedChatAtGenerateTime = { length: chat.length, last: { ...chat[chat.length - 1] } };
        return 'the raw phone output';
    };
    const result = await runPhoneCommand({ chat, generate: fakeGenerate, commandText: '!Phone: show ten posts', userName: 'Ava' });
    assert.equal(result, 'the raw phone output');
    assert.equal(capturedChatAtGenerateTime.length, 2);
    assert.equal(capturedChatAtGenerateTime.last.mes, '!Phone: show ten posts');
    assert.equal(capturedChatAtGenerateTime.last.is_user, true);
    assert.equal(capturedChatAtGenerateTime.last.name, 'Ava');
});

test('runPhoneCommand removes the synthetic message from chat after generate resolves (success case)', async () => {
    const chat = [{ is_user: true, name: 'Ava', mes: 'earlier real message', send_date: 1 }];
    const fakeGenerate = async () => 'the raw phone output';
    await runPhoneCommand({ chat, generate: fakeGenerate, commandText: '!Phone: show ten posts', userName: 'Ava' });
    assert.deepEqual(chat, [{ is_user: true, name: 'Ava', mes: 'earlier real message', send_date: 1 }]);
});

test('runPhoneCommand removes the synthetic message from chat even if generate throws', async () => {
    const chat = [{ is_user: true, name: 'Ava', mes: 'earlier real message', send_date: 1 }];
    const fakeGenerate = async () => { throw new Error('backend exploded'); };
    await assert.rejects(
        () => runPhoneCommand({ chat, generate: fakeGenerate, commandText: '!Phone: show ten posts', userName: 'Ava' }),
        /backend exploded/,
    );
    // This is the single most important assertion in this entire milestone: chat must be restored
    // to its exact original state even when the generation call itself fails.
    assert.deepEqual(chat, [{ is_user: true, name: 'Ava', mes: 'earlier real message', send_date: 1 }]);
});

test('runPhoneCommand works correctly on an empty chat array (fresh main roleplay, no history yet)', async () => {
    const chat = [];
    const fakeGenerate = async () => {
        assert.equal(chat.length, 1);
        return 'output';
    };
    const result = await runPhoneCommand({ chat, generate: fakeGenerate, commandText: '!Phone: show ten posts', userName: 'Ava' });
    assert.equal(result, 'output');
    assert.deepEqual(chat, []);
});

test('runPhoneCommand restores chat correctly even if a concurrent push happened to the same array reference during generate (defensive: pops by reference, not by blind array.pop())', async () => {
    // This models the (rare, but real) risk of another synthetic push racing this one on the same
    // shared array. runPhoneCommand must remove exactly the message IT pushed, not just "the last
    // element," so it must not corrupt an unrelated entry that happened to be pushed afterward.
    const chat = [{ is_user: true, name: 'Ava', mes: 'earlier real message', send_date: 1 }];
    let pushedMessage;
    const fakeGenerate = async () => {
        pushedMessage = chat[chat.length - 1];
        // Simulate something else appending to chat while this generate() call is in flight.
        chat.push({ is_user: true, name: 'Ava', mes: 'a totally unrelated concurrent message', send_date: 2 });
        return 'output';
    };
    await runPhoneCommand({ chat, generate: fakeGenerate, commandText: '!Phone: show ten posts', userName: 'Ava' });
    // The synthetic phone-command message must be gone; the concurrent unrelated message must survive.
    assert.equal(chat.some(m => m === pushedMessage), false);
    assert.equal(chat.some(m => m.mes === 'a totally unrelated concurrent message'), true);
});
