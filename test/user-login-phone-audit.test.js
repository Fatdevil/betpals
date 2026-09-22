import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';

describe('User Authentication & Swedish Phone Normalization Audit', () => {

  test('normalizePhone correctly normalizes various Swedish phone number formats', () => {
    // Standard 10-digit Swedish mobile
    assert.equal(db.normalizePhone('0701234567'), '0701234567');
    assert.equal(db.normalizePhone('070-123 45 67'), '0701234567');
    assert.equal(db.normalizePhone('070 123 45 67'), '0701234567');
    assert.equal(db.normalizePhone('072-998 87 76'), '0729988776');
    assert.equal(db.normalizePhone('073 111 22 33'), '0731112233');

    // International +46 format
    assert.equal(db.normalizePhone('+46 70 123 45 67'), '0701234567');
    assert.equal(db.normalizePhone('+46701234567'), '0701234567');
    assert.equal(db.normalizePhone('46701234567'), '0701234567');
    assert.equal(db.normalizePhone('0046701234567'), '0701234567');
    assert.equal(db.normalizePhone('+46 (0)70 123 45 67'), '0701234567');

    // Without leading 0 (9 digits starting with 7)
    assert.equal(db.normalizePhone('701234567'), '0701234567');

    // Landline format
    assert.equal(db.normalizePhone('08-123 456'), '08123456');
    assert.equal(db.normalizePhone('+46 8 123 456'), '08123456');

    // Null or invalid
    assert.equal(db.normalizePhone(''), '');
    assert.equal(db.normalizePhone(null), '');
    assert.equal(db.normalizePhone(undefined), '');
  });

  test('getUserByNicknameOrSwish matches user via any phone format, real name, @nickname or nickname', () => {
    const timestamp = Date.now();
    const rand7 = String(Math.floor(1000000 + Math.random() * 9000000));
    const userId = `test-user-${timestamp}`;
    const nickname = `TestNick${timestamp}`;
    const realName = `Sven Svensson ${timestamp}`;
    const swishNumber = `070${rand7}`; // stored canonical
    const pin = '4321';
    const token = `token-${timestamp}`;

    // Create test user
    db.createUser(userId, nickname, token, '🦁', realName, swishNumber, pin);

    const user = db.getUserById(userId);
    assert.ok(user, 'User should be created');

    // 1. Direct nickname
    const byNick = db.getUserByNicknameOrSwish(nickname);
    assert.equal(byNick?.id, userId, 'Should find by nickname');

    // 2. Nickname case insensitive
    const byNickLower = db.getUserByNicknameOrSwish(nickname.toLowerCase());
    assert.equal(byNickLower?.id, userId, 'Should find by lowercase nickname');

    // 3. Nickname with @
    const byAtNick = db.getUserByNicknameOrSwish(`@${nickname}`);
    assert.equal(byAtNick?.id, userId, 'Should find by @nickname');

    // 4. Real name
    const byRealName = db.getUserByNicknameOrSwish(realName);
    assert.equal(byRealName?.id, userId, 'Should find by real name');

    // 5. Canonical phone number
    const byPhone = db.getUserByNicknameOrSwish(`070${rand7}`);
    assert.equal(byPhone?.id, userId, 'Should find by raw 070 phone');

    // 6. Formatted phone number with spaces and dashes
    const formatted = `070-${rand7.slice(0, 3)} ${rand7.slice(3, 5)} ${rand7.slice(5)}`;
    const byFormattedPhone = db.getUserByNicknameOrSwish(formatted);
    assert.equal(byFormattedPhone?.id, userId, 'Should find by formatted phone');

    // 7. International phone with +46
    const byIntlPhone = db.getUserByNicknameOrSwish(`+46 70 ${rand7.slice(0, 3)} ${rand7.slice(3)}`);
    assert.equal(byIntlPhone?.id, userId, 'Should find by +46 phone');

    // 8. International phone with 46
    const by46Phone = db.getUserByNicknameOrSwish(`4670${rand7}`);
    assert.equal(by46Phone?.id, userId, 'Should find by 46 phone');

    // 9. Phone with 0046
    const by0046Phone = db.getUserByNicknameOrSwish(`0046 70 ${rand7}`);
    assert.equal(by0046Phone?.id, userId, 'Should find by 0046 phone');

    // 10. Phone without leading 0
    const by9DigitPhone = db.getUserByNicknameOrSwish(`70${rand7}`);
    assert.equal(by9DigitPhone?.id, userId, 'Should find by 9-digit phone');

    // 11. PIN verification
    assert.equal(db.verifyUserPin(user, '4321'), true, 'Correct PIN should verify');
    assert.equal(db.verifyUserPin(user, '0000'), false, 'Wrong PIN should fail');
    assert.equal(db.verifyUserPin(user, '1234'), false, 'Wrong PIN should fail');
  });

  test('getUserBySwish resolves both canonical 070 and legacy 46 formats', () => {
    const timestamp = Date.now();
    const rand7 = String(Math.floor(1000000 + Math.random() * 9000000));
    const legacyId = `legacy-user-${timestamp}`;
    const legacyNick = `LegacyUser${timestamp}`;
    const legacySwish = `4670${rand7}`; // stored as legacy international digits

    db.createUser(legacyId, legacyNick, `tok-${timestamp}`, '👤', 'Legacy Person', legacySwish, '1111');

    // Searching with 070 format should find the legacy user
    const foundFrom070 = db.getUserByNicknameOrSwish(`070${rand7}`);
    assert.equal(foundFrom070?.id, legacyId, 'Should find legacy 46 user when typing 070');

    // Searching with +46 format should also find the legacy user
    const foundFromPlus46 = db.getUserByNicknameOrSwish(`+46 70 ${rand7.slice(0, 3)} ${rand7.slice(3)}`);
    assert.equal(foundFromPlus46?.id, legacyId, 'Should find legacy 46 user when typing +46');
  });
});
