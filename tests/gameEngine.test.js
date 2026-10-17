/**
 * Unit Tests for gameEngine.js
 * International 56 Ruleset (ITR) Core Game Engine
 */
const test = require('node:test');
const assert = require('node:assert');
const GameEngine = require('../gameEngine.js');

test('GameEngine - Deck Generation and Values', async (t) => {
    await t.test('generates standard 48-card double deck (2 copies of 24 cards)', () => {
        const deck = GameEngine.generateDeck();
        assert.strictEqual(deck.length, 48, 'Deck must contain exactly 48 cards');

        // Total points in deck must be 56: (8 Jacks * 3) + (8 Nines * 2) + (8 Aces * 1) + (8 Tens * 1)
        const totalPoints = deck.reduce((sum, c) => sum + c.points, 0);
        assert.strictEqual(totalPoints, 56, 'Total points across all cards must equal 56');

        // Check counts of each rank across the deck
        const counts = {};
        deck.forEach(c => counts[c.value] = (counts[c.value] || 0) + 1);
        assert.strictEqual(counts['J'], 8, 'Must have 8 Jacks');
        assert.strictEqual(counts['9'], 8, 'Must have 8 Nines');
        assert.strictEqual(counts['A'], 8, 'Must have 8 Aces');
        assert.strictEqual(counts['10'], 8, 'Must have 8 Tens');
        assert.strictEqual(counts['K'], 8, 'Must have 8 Kings');
        assert.strictEqual(counts['Q'], 8, 'Must have 8 Queens');
    });

    await t.test('shuffleDeck preserves all cards without mutation of original array', () => {
        const deck = GameEngine.generateDeck();
        const shuffled = GameEngine.shuffleDeck(deck);
        assert.strictEqual(shuffled.length, 48);
        assert.notStrictEqual(shuffled, deck);
        
        const sumOrig = deck.reduce((s, c) => s + c.points, 0);
        const sumShuffled = shuffled.reduce((s, c) => s + c.points, 0);
        assert.strictEqual(sumShuffled, sumOrig);
    });

    await t.test('sortHand orders cards by suit and descending rank power', () => {
        const hand = [
            { suit: '♦', value: 'Q' },
            { suit: '♠', value: '9' },
            { suit: '♠', value: 'J' },
            { suit: '♥', value: 'A' }
        ];
        const sorted = GameEngine.sortHand(hand);
        assert.strictEqual(sorted[0].suit, '♠');
        assert.strictEqual(sorted[0].value, 'J');
        assert.strictEqual(sorted[1].suit, '♠');
        assert.strictEqual(sorted[1].value, '9');
        assert.strictEqual(sorted[2].suit, '♥');
        assert.strictEqual(sorted[3].suit, '♦');
    });
});

test('GameEngine - ITR Legal Moves (getLegalCardIndices)', async (t) => {
    const hand = [
        { id: 'c1', suit: '♠', value: 'J', rank: 6 },
        { id: 'c2', suit: '♠', value: '10', rank: 3 },
        { id: 'c3', suit: '♥', value: 'A', rank: 4 },
        { id: 'c4', suit: '♣', value: '9', rank: 5 }
    ];

    await t.test('leader can play any card from hand', () => {
        const legalEmpty = GameEngine.getLegalCardIndices(hand, []);
        assert.deepStrictEqual(legalEmpty, [0, 1, 2, 3]);

        const legalNull = GameEngine.getLegalCardIndices(hand, null);
        assert.deepStrictEqual(legalNull, [0, 1, 2, 3]);
    });

    await t.test('player holding lead suit MUST follow suit', () => {
        const trick = [{ seat: 0, card: { suit: '♠', value: 'Q', rank: 1 } }];
        const legal = GameEngine.getLegalCardIndices(hand, trick);
        assert.deepStrictEqual(legal, [0, 1], 'Only cards of suit ♠ are legal');
    });

    await t.test('player VOID in lead suit can play ANY card (trump or discard)', () => {
        const trick = [{ seat: 0, card: { suit: '♦', value: 'K', rank: 2 } }];
        // Hand has no ♦
        const legal = GameEngine.getLegalCardIndices(hand, trick);
        assert.deepStrictEqual(legal, [0, 1, 2, 3], 'Void player may play any card');
    });
});

test('GameEngine - Trick Winner Evaluation & Duplicate Precedence', async (t) => {
    await t.test('highest trump wins against lead suit', () => {
        const trick = [
            { seat: 0, card: { suit: '♠', value: 'J', rank: 6, points: 3 } }, // lead ♠
            { seat: 1, card: { suit: '♥', value: '9', rank: 5, points: 2 } }  // trump ♥
        ];
        const res = GameEngine.evaluateTrickWinner(trick, '♥');
        assert.strictEqual(res.winnerSeat, 1, 'Trump card beats non-trump lead');
        assert.strictEqual(res.points, 5);
    });

    await t.test('duplicate card precedence: earlier played duplicate rank holds precedence', () => {
        const trick = [
            { seat: 1, card: { suit: '♥', value: 'J', rank: 6, points: 3, copy: 0 }, playOrder: 0 },
            { seat: 3, card: { suit: '♥', value: 'J', rank: 6, points: 3, copy: 1 }, playOrder: 1 }
        ];
        const res = GameEngine.evaluateTrickWinner(trick, '♥');
        assert.strictEqual(res.winnerSeat, 1, 'Earlier played duplicate Jack of trumps wins');
    });

    await t.test('duplicate non-trump lead suit precedence', () => {
        const trick = [
            { seat: 2, card: { suit: '♣', value: 'A', rank: 4, points: 1, copy: 0 } },
            { seat: 5, card: { suit: '♣', value: 'A', rank: 4, points: 1, copy: 1 } }
        ];
        const res = GameEngine.evaluateTrickWinner(trick, '♦');
        assert.strictEqual(res.winnerSeat, 2, 'First played Ace of Clubs holds precedence');
    });

    await t.test('No Trump (NT) contracts: no cards can trump', () => {
        const trick = [
            { seat: 0, card: { suit: '♦', value: '10', rank: 3, points: 1 } }, // lead ♦10
            { seat: 1, card: { suit: '♠', value: 'J', rank: 6, points: 3 } },  // discarded ♠J
            { seat: 2, card: { suit: '♦', value: 'A', rank: 4, points: 1 } }   // followed ♦A
        ];
        const res = GameEngine.evaluateTrickWinner(trick, 'NT');
        assert.strictEqual(res.winnerSeat, 2, 'In NT, highest card of lead suit (♦A) wins over discarded ♠J');
        assert.strictEqual(res.points, 5);
    });
});

test('GameEngine - ITR Table Scoring Scale & Multipliers', async (t) => {
    // 28–39: Made = 1, Defeated = 2
    assert.deepStrictEqual(GameEngine.calculateTableScore(28, true, false, false), { baseTables: 1, multiplier: 1, totalTables: 1 });
    assert.deepStrictEqual(GameEngine.calculateTableScore(39, false, false, false), { baseTables: 2, multiplier: 1, totalTables: 2 });

    // 40–47 (Honours): Made = 2, Defeated = 3
    assert.deepStrictEqual(GameEngine.calculateTableScore(40, true, false, false), { baseTables: 2, multiplier: 1, totalTables: 2 });
    assert.deepStrictEqual(GameEngine.calculateTableScore(47, false, false, false), { baseTables: 3, multiplier: 1, totalTables: 3 });

    // 48–55: Made = 3, Defeated = 4
    assert.deepStrictEqual(GameEngine.calculateTableScore(48, true, false, false), { baseTables: 3, multiplier: 1, totalTables: 3 });
    assert.deepStrictEqual(GameEngine.calculateTableScore(55, false, false, false), { baseTables: 4, multiplier: 1, totalTables: 4 });

    // 56 (Thani): Made = 4, Defeated = 5
    assert.deepStrictEqual(GameEngine.calculateTableScore(56, true, false, false), { baseTables: 4, multiplier: 1, totalTables: 4 });
    assert.deepStrictEqual(GameEngine.calculateTableScore(56, false, false, false), { baseTables: 5, multiplier: 1, totalTables: 5 });

    // Doubled multiplier: 2x
    const doubledWin = GameEngine.calculateTableScore(30, true, true, false);
    assert.strictEqual(doubledWin.multiplier, 2);
    assert.strictEqual(doubledWin.totalTables, 2);

    const doubledLoss = GameEngine.calculateTableScore(40, false, true, false);
    assert.strictEqual(doubledLoss.multiplier, 2);
    assert.strictEqual(doubledLoss.totalTables, 6); // 3 base * 2

    // Redoubled multiplier: 4x
    const redoubledWin = GameEngine.calculateTableScore(48, true, false, true);
    assert.strictEqual(redoubledWin.multiplier, 4);
    assert.strictEqual(redoubledWin.totalTables, 12); // 3 base * 4

    const redoubledLoss = GameEngine.calculateTableScore(56, false, false, true);
    assert.strictEqual(redoubledLoss.multiplier, 4);
    assert.strictEqual(redoubledLoss.totalTables, 20); // 5 base * 4
});
