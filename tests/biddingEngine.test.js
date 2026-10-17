/**
 * Unit Tests for biddingEngine.js
 * International 56 Ruleset (ITR) Bidding Engine
 */
const test = require('node:test');
const assert = require('node:assert');
const BiddingEngine = require('../biddingEngine.js');

test('BiddingEngine - State Initialization & Compulsory Opening Bid', async (t) => {
    await t.test('initializes with dealer + 1 as opening bidder', () => {
        const state = BiddingEngine.createBiddingState(0);
        assert.strictEqual(state.turnSeat, 1, 'First bidder is seat 1 when dealer is 0');
        assert.strictEqual(state.currentBid, 27);
        assert.strictEqual(state.highBidder, null);
        assert.strictEqual(state.isComplete, false);
    });

    await t.test('opening bidder CANNOT pass (compulsory opening bid rule)', () => {
        const state = BiddingEngine.createBiddingState(0);
        assert.throws(
            () => BiddingEngine.processPass(state, 1),
            /compulsory bid/i,
            'First bidder must make compulsory bid of at least 28'
        );
    });

    await t.test('opening bidder must bid at least 28 with valid suit or NT', () => {
        const state = BiddingEngine.createBiddingState(0);
        assert.strictEqual(BiddingEngine.isValidBid(state, 1, 27, '♠'), false, 'Bid of 27 is invalid');
        assert.strictEqual(BiddingEngine.isValidBid(state, 1, 28, 'INVALID'), false, 'Invalid denomination');
        assert.strictEqual(BiddingEngine.isValidBid(state, 1, 28, '♠'), true, '28 ♠ is valid opening');
        assert.strictEqual(BiddingEngine.isValidBid(state, 1, 28, 'NT'), true, '28 NT is valid opening');
    });
});

test('BiddingEngine - Competitive Bidding & Progression', async (t) => {
    await t.test('advances clockwise and requires strictly higher point value', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♥');
        assert.strictEqual(state.currentBid, 28);
        assert.strictEqual(state.currentSuit, '♥');
        assert.strictEqual(state.highBidder, 1);
        assert.strictEqual(state.turnSeat, 2, 'Turn advances to seat 2');

        // Seat 2 cannot bid equal or lower
        assert.strictEqual(BiddingEngine.isValidBid(state, 2, 28, '♠'), false);
        assert.strictEqual(BiddingEngine.isValidBid(state, 2, 27, '♠'), false);

        // Seat 2 can bid higher
        assert.strictEqual(BiddingEngine.isValidBid(state, 2, 29, '♣'), true);
        BiddingEngine.processBid(state, 2, 29, '♣');
        assert.strictEqual(state.currentBid, 29);
        assert.strictEqual(state.highBidder, 2);
        assert.strictEqual(state.turnSeat, 3);
    });

    await t.test('rejects bid out of turn', () => {
        const state = BiddingEngine.createBiddingState(0);
        assert.throws(
            () => BiddingEngine.processBid(state, 3, 28, '♠'),
            /Invalid bid/
        );
    });
});

test('BiddingEngine - Doubling and Redoubling Mechanics', async (t) => {
    await t.test('only opponents can Double a contract', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠'); // Team 1 has high bid (seat 1)
        
        // Seat 3 is partner of Seat 1 (Team 1). Cannot double partner!
        state.turnSeat = 3;
        assert.strictEqual(BiddingEngine.isValidDouble(state, 3), false, 'Partner cannot double partner');

        // Seat 2 is opponent (Team 0). Can double!
        state.turnSeat = 2;
        assert.strictEqual(BiddingEngine.isValidDouble(state, 2), true, 'Opponent can double');

        BiddingEngine.processDouble(state, 2);
        assert.strictEqual(state.isDoubled, true);
        assert.strictEqual(state.doubledBy, 2);
        assert.strictEqual(state.isComplete, false, 'Auction continues after double');
        assert.strictEqual(state.turnSeat, 3);
    });

    await t.test('cannot double an already doubled contract', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠');
        BiddingEngine.processDouble(state, 2);

        state.turnSeat = 4; // Another opponent
        assert.strictEqual(BiddingEngine.isValidDouble(state, 4), false, 'Cannot double twice');
    });

    await t.test('Redouble: only contract team can redouble a doubled contract', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠');
        BiddingEngine.processDouble(state, 2);

        // Turn is seat 3 (Team 1, partner of bidder). Can redouble!
        assert.strictEqual(BiddingEngine.isValidRedouble(state, 3), true);

        // Opponents cannot redouble
        assert.strictEqual(BiddingEngine.isValidRedouble(state, 4), false);
    });

    await t.test('Redouble immediately concludes the auction in International 56', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠');
        BiddingEngine.processDouble(state, 2);
        
        BiddingEngine.processRedouble(state, 3);
        assert.strictEqual(state.isRedoubled, true);
        assert.strictEqual(state.redoubledBy, 3);
        assert.strictEqual(state.isComplete, true, 'Auction must immediately conclude upon Redouble');

        const contract = BiddingEngine.getWinningContract(state);
        assert.strictEqual(contract.highBidder, 1);
        assert.strictEqual(contract.bid, 28);
        assert.strictEqual(contract.suit, '♠');
        assert.strictEqual(contract.isDoubled, true);
        assert.strictEqual(contract.isRedoubled, true);
    });
});

test('BiddingEngine - 5 Consecutive Passes Concludes Auction', async (t) => {
    await t.test('auction concludes after 5 consecutive passes following a bid', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♦'); // Seat 1 bids 28 ♦

        // Next 5 players pass: Seats 2, 3, 4, 5, 0
        const passSeats = [2, 3, 4, 5, 0];
        for (let i = 0; i < passSeats.length; i++) {
            assert.strictEqual(state.isComplete, false, `Auction should not be complete after ${i} passes`);
            BiddingEngine.processPass(state, passSeats[i]);
        }

        assert.strictEqual(state.isComplete, true, 'Auction must be complete after 5 passes');
        const contract = BiddingEngine.getWinningContract(state);
        assert.strictEqual(contract.highBidder, 1);
        assert.strictEqual(contract.bid, 28);
        assert.strictEqual(contract.suit, '♦');
        assert.strictEqual(contract.isDoubled, false);
        assert.strictEqual(contract.isRedoubled, false);
    });

    await t.test('resumed auction via restoreBiddingState remembers passes already made', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠'); // Seat 1 bids 28 ♠
        BiddingEngine.processPass(state, 2);        // Pass 1
        BiddingEngine.processPass(state, 3);        // Pass 2
        BiddingEngine.processPass(state, 4);        // Pass 3

        // Simulate hostState snapshot saved during bidding
        const hostStateSnapshot = {
            phase: 'BIDDING',
            highBid: state.currentBid,
            trumpSuit: state.currentSuit,
            convention: state.currentConvention,
            highBidder: state.highBidder,
            consecutivePasses: state.consecutivePasses,
            turnSeat: state.turnSeat,
            isDoubled: state.isDoubled,
            doubledBy: state.doubledBy,
            isRedoubled: state.isRedoubled,
            redoubledBy: state.redoubledBy,
            bids: state.bids
        };

        const restored = BiddingEngine.restoreBiddingState(hostStateSnapshot);
        assert.strictEqual(restored.consecutivePasses, 3, 'Restored state must retain 3 consecutive passes');
        assert.strictEqual(restored.turnSeat, 5);
        assert.strictEqual(restored.isComplete, false);

        // Only 2 more passes (Seats 5 and 0) should conclude the auction
        BiddingEngine.processPass(restored, 5); // Pass 4
        assert.strictEqual(restored.isComplete, false);
        BiddingEngine.processPass(restored, 0); // Pass 5
        assert.strictEqual(restored.isComplete, true, 'Auction must end immediately after the 5th total pass');
    });
});

test('BiddingEngine - International 56 Bidding Conventions (+28, +1 Single J, +2)', async (t) => {
    await t.test('+28 Convention: opening with Jack and 2 other cards', () => {
        const state = BiddingEngine.createBiddingState(0);
        assert.strictEqual(BiddingEngine.isValidPlus28Bid(state, 1, '♥'), true);
        
        BiddingEngine.processPlus28Bid(state, 1, '♥');
        assert.strictEqual(state.currentBid, 28);
        assert.strictEqual(state.currentSuit, '♥');
        assert.strictEqual(state.currentConvention, 'PLUS_28');
        assert.strictEqual(state.bids[0].convention, 'PLUS_28');
        
        // Cannot bid +28 once bid is already 28
        assert.strictEqual(BiddingEngine.isValidPlus28Bid(state, 2, '♦'), false);
    });

    await t.test('+1 Convention: Single Jack response increments high bid by 1', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠');

        // Seat 2 holds a single Jack of Diamonds (Dice) -> responds +1 Dice
        assert.strictEqual(BiddingEngine.isValidPlusOneBid(state, 2, '♦'), true);
        BiddingEngine.processPlusOneBid(state, 2, '♦');

        assert.strictEqual(state.currentBid, 29, '+1 increments contract to 29');
        assert.strictEqual(state.currentSuit, '♦');
        assert.strictEqual(state.currentConvention, 'PLUS_1');
        assert.strictEqual(state.highBidder, 2);
    });

    await t.test('+2 Convention: Strong support increments high bid by 2', () => {
        const state = BiddingEngine.createBiddingState(0);
        BiddingEngine.processBid(state, 1, 28, '♠');

        assert.strictEqual(BiddingEngine.isValidPlusTwoBid(state, 2, '♠'), true);
        BiddingEngine.processPlusTwoBid(state, 2, '♠');

        assert.strictEqual(state.currentBid, 30, '+2 increments contract to 30');
        assert.strictEqual(state.currentSuit, '♠');
        assert.strictEqual(state.currentConvention, 'PLUS_2');
    });
});
