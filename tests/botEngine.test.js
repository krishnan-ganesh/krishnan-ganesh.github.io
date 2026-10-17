/**
 * Unit Tests for botEngine.js
 * International 56 Ruleset (ITR) Autonomous AI Bot Engine
 */
const test = require('node:test');
const assert = require('node:assert');
const GameEngine = require('../gameEngine.js');
const BiddingEngine = require('../biddingEngine.js');
const GameState = require('../gameState.js');
const BotEngine = require('../botEngine.js');

test('BotEngine - Hand Evaluation', async (t) => {
    await t.test('accurately calculates points, suit lengths, and best suit', () => {
        const hand = [
            { suit: '♠', value: 'J', points: 3, rank: 6 },
            { suit: '♠', value: '9', points: 2, rank: 5 },
            { suit: '♠', value: 'A', points: 1, rank: 4 },
            { suit: '♥', value: '10', points: 1, rank: 3 },
            { suit: '♥', value: 'K', points: 0, rank: 2 },
            { suit: '♣', value: 'Q', points: 0, rank: 1 },
            { suit: '♦', value: 'Q', points: 0, rank: 1 },
            { suit: '♦', value: 'K', points: 0, rank: 2 }
        ];

        const evalResult = BotEngine.evaluateHand(hand);
        assert.strictEqual(evalResult.totalPoints, 7);
        assert.strictEqual(evalResult.counts['♠'], 3);
        assert.strictEqual(evalResult.counts['♥'], 2);
        assert.strictEqual(evalResult.bestSuit, '♠', 'Spades has J, 9, A and highest score');
        assert.strictEqual(evalResult.isBalancedForNT, false);
    });

    await t.test('detects balanced high-point hand for No Trump (NT)', () => {
        const balancedHand = [
            { suit: '♠', value: 'J', points: 3, rank: 6 },
            { suit: '♠', value: '9', points: 2, rank: 5 },
            { suit: '♥', value: 'J', points: 3, rank: 6 },
            { suit: '♥', value: 'A', points: 1, rank: 4 },
            { suit: '♣', value: 'J', points: 3, rank: 6 },
            { suit: '♦', value: '9', points: 2, rank: 5 },
            { suit: '♦', value: 'A', points: 1, rank: 4 },
            { suit: '♦', value: '10', points: 1, rank: 3 }
        ];

        const evalResult = BotEngine.evaluateHand(balancedHand);
        assert.ok(evalResult.totalPoints >= 13);
        assert.strictEqual(evalResult.isBalancedForNT, true);
    });
});

test('BotEngine - Bidding AI Strategy under ITR', async (t) => {
    await t.test('makes compulsory 28 opening bid as first bidder', () => {
        const state = GameState.createInitialState('host_1', 'Host');
        GameState.fillEmptySeatsWithBots(state);
        const deck = GameEngine.shuffleDeck(GameEngine.generateDeck());
        const dealt = Array.from({ length: 6 }, (_, i) => deck.slice(i * 8, (i + 1) * 8));
        GameState.resetForNewRound(state, dealt);
        const bidding = BiddingEngine.createBiddingState(0);

        const action = BotEngine.computeBotAction(1, state, bidding);
        assert.strictEqual(action.type, 'BID');
        assert.strictEqual(action.bid, 28);
        assert.ok(['♠', '♥', '♣', '♦', 'NT'].includes(action.suit));
    });

    await t.test('does not overbid partner holding high bid', () => {
        const state = GameState.createInitialState('host_1', 'Host');
        GameState.fillEmptySeatsWithBots(state);
        const deck = GameEngine.shuffleDeck(GameEngine.generateDeck());
        const dealt = Array.from({ length: 6 }, (_, i) => deck.slice(i * 8, (i + 1) * 8));
        GameState.resetForNewRound(state, dealt);
        const bidding = BiddingEngine.createBiddingState(0);

        // Seat 1 (Team 1) bids 28 ♠
        BiddingEngine.processBid(bidding, 1, 28, '♠');
        state.highBid = 28;
        state.highBidder = 1;
        state.trumpSuit = '♠';

        // Turn arrives at Seat 3 (Team 1, partner of Seat 1)
        bidding.turnSeat = 3;
        state.turnSeat = 3;

        const action = BotEngine.computeBotAction(3, state, bidding);
        assert.strictEqual(action.type, 'PASS', 'Bot should pass to support partner bid');
    });

    await t.test('bids +28 Hearts when holding a Jack and 2 other cards in Hearts', () => {
        const state = GameState.createInitialState('host_1', 'Host');
        state.phase = 'BIDDING';
        state.turnSeat = 1;
        // Seat 1 holds J♥ and 2 other Hearts (3 cards total in Hearts)
        state.seats[1].hand = [
            { suit: '♥', value: 'J', points: 3, rank: 6 },
            { suit: '♥', value: '10', points: 1, rank: 3 },
            { suit: '♥', value: 'K', points: 0, rank: 2 },
            { suit: '♠', value: 'Q', points: 0, rank: 1 },
            { suit: '♠', value: 'K', points: 0, rank: 2 },
            { suit: '♣', value: 'Q', points: 0, rank: 1 },
            { suit: '♦', value: 'Q', points: 0, rank: 1 },
            { suit: '♦', value: 'K', points: 0, rank: 2 }
        ];

        const bidding = BiddingEngine.createBiddingState(0);
        const action = BotEngine.computeBotAction(1, state, bidding);
        assert.strictEqual(action.type, 'BID');
        assert.strictEqual(action.bid, 28);
        assert.strictEqual(action.suit, '♥');
        assert.strictEqual(action.convention, 'PLUS_28', 'Should bid +28 convention');
    });

    await t.test('bids +1 Dice when holding a single Jack of Dice / Diamonds', () => {
        const state = GameState.createInitialState('host_1', 'Host');
        state.phase = 'BIDDING';
        state.turnSeat = 2; // Team 0
        // Seat 2 holds single Jack of Diamonds (Dice)
        state.seats[2].hand = [
            { suit: '♦', value: 'J', points: 3, rank: 6 }, // single J Dice!
            { suit: '♠', value: '10', points: 1, rank: 3 },
            { suit: '♠', value: 'K', points: 0, rank: 2 },
            { suit: '♣', value: 'Q', points: 0, rank: 1 },
            { suit: '♣', value: 'K', points: 0, rank: 2 },
            { suit: '♣', value: 'A', points: 1, rank: 4 },
            { suit: '♥', value: 'Q', points: 0, rank: 1 },
            { suit: '♥', value: 'K', points: 0, rank: 2 }
        ];

        const bidding = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(bidding, 1, 28, '♠'); // Opponent bids 28 ♠
        state.highBid = 28;
        state.highBidder = 1;
        state.trumpSuit = '♠';
        bidding.turnSeat = 2;

        const action = BotEngine.computeBotAction(2, state, bidding);
        assert.strictEqual(action.type, 'BID');
        assert.strictEqual(action.bid, 29);
        assert.strictEqual(action.suit, '♦');
        assert.strictEqual(action.convention, 'PLUS_1', 'Should bid +1 Dice (Single Jack)');
    });
});

test('BotEngine - Card Play Decisions under ITR', async (t) => {
    await t.test('leading the trick leads high trump Jack to exhaust trumps', () => {
        const state = GameState.createInitialState('host_1', 'Host');
        state.phase = 'PLAYING';
        state.trumpSuit = '♠';
        state.currentTrick = [];
        state.turnSeat = 1;

        // Seat 1 hand has ♠J
        state.seats[1].hand = [
            { id: 'c_spade_j', suit: '♠', value: 'J', rank: 6, points: 3 },
            { id: 'c_heart_k', suit: '♥', value: 'K', rank: 2, points: 0 }
        ];

        const action = BotEngine.computeBotAction(1, state, null);
        assert.strictEqual(action.type, 'PLAY_CARD');
        assert.strictEqual(action.cardId, 'c_spade_j', 'Should lead Jack of trumps');
    });

    await t.test('cuts with lowest winning trump when void and opponent winning', () => {
        const state = GameState.createInitialState('host_1', 'Host');
        state.phase = 'PLAYING';
        state.trumpSuit = '♥';
        state.turnSeat = 1; // Team 1

        // Current trick led by Seat 0 (Team 0, opponent) with ♣A
        state.currentTrick = [
            { seat: 0, card: { suit: '♣', value: 'A', rank: 4, points: 1 } }
        ];

        // Seat 1 is void in ♣, holds ♥9 (rank 5) and ♥J (rank 6)
        state.seats[1].hand = [
            { id: 'c_trump_9', suit: '♥', value: '9', rank: 5, points: 2 },
            { id: 'c_trump_j', suit: '♥', value: 'J', rank: 6, points: 3 }
        ];

        const action = BotEngine.computeBotAction(1, state, null);
        assert.strictEqual(action.type, 'PLAY_CARD');
        assert.strictEqual(action.cardId, 'c_trump_9', 'Should cut with lowest winning trump (9 of hearts)');
    });
});
