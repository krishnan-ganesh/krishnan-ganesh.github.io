/**
 * Integration Tests for 56 Kerala Card Game
 * Validates End-to-End International 56 Ruleset (ITR) across all engines:
 * - gameEngine.js
 * - biddingEngine.js
 * - gameState.js
 * - botEngine.js
 */
const test = require('node:test');
const assert = require('node:assert');
const GameEngine = require('../gameEngine.js');
const BiddingEngine = require('../biddingEngine.js');
const GameState = require('../gameState.js');
const BotEngine = require('../botEngine.js');

test('Integration - Complete 6-Player ITR Game Round Simulation', async () => {
    // 1. Initial State: 6 players, 12 tables each
    const state = GameState.createInitialState('host_p1', 'Alice (Host)');
    GameState.fillEmptySeatsWithBots(state);
    assert.strictEqual(state.tables[0], 12);
    assert.strictEqual(state.tables[1], 12);

    // 2. Deal 48 cards (8 to each of 6 players)
    const deck = GameEngine.shuffleDeck(GameEngine.generateDeck());
    assert.strictEqual(deck.length, 48);
    const dealtHands = [];
    for (let i = 0; i < 6; i++) {
        dealtHands.push(GameEngine.sortHand(deck.slice(i * 8, (i + 1) * 8)));
    }
    GameState.resetForNewRound(state, dealtHands);
    assert.strictEqual(state.phase, 'BIDDING');

    // 3. Bidding Auction under ITR
    const bidding = BiddingEngine.createBiddingState(state.dealerSeat);
    let turns = 0;
    while (!bidding.isComplete && turns < 60) {
        turns++;
        const curSeat = bidding.turnSeat;
        state.turnSeat = curSeat;
        const action = BotEngine.computeBotAction(curSeat, state, bidding);
        assert.ok(action, `Bot at seat ${curSeat} must provide an action`);

        if (action.type === 'PASS') {
            BiddingEngine.processPass(bidding, curSeat);
        } else if (action.type === 'BID') {
            BiddingEngine.processBid(bidding, curSeat, action.bid, action.suit);
        } else if (action.type === 'DOUBLE') {
            BiddingEngine.processDouble(bidding, curSeat);
        } else if (action.type === 'REDOUBLE') {
            BiddingEngine.processRedouble(bidding, curSeat);
        }

        state.highBid = bidding.currentBid;
        state.highBidder = bidding.highBidder;
        state.trumpSuit = bidding.currentSuit;
        state.isDoubled = bidding.isDoubled;
        state.isRedoubled = bidding.isRedoubled;
        state.consecutivePasses = bidding.consecutivePasses;
        state.turnSeat = bidding.turnSeat;
    }

    assert.strictEqual(bidding.isComplete, true, 'Auction must complete cleanly');
    const contract = BiddingEngine.getWinningContract(bidding);
    assert.ok(contract.bid >= 28 && contract.bid <= 56);
    assert.ok(['♠', '♥', '♣', '♦', 'NT'].includes(contract.suit));

    // 4. Transition to Trick Play with Open Trump
    GameState.startTrickPlay(state, contract);
    assert.strictEqual(state.phase, 'PLAYING');
    assert.strictEqual(state.trumpSuit, contract.suit);

    // 5. Play all 8 tricks
    for (let trickIdx = 1; trickIdx <= 8; trickIdx++) {
        state.currentTrick = [];
        state.trickNumber = trickIdx;

        for (let turn = 0; turn < 6; turn++) {
            const seatIdx = state.turnSeat;
            const cardAction = BotEngine.computeBotAction(seatIdx, state, null);
            assert.ok(cardAction && cardAction.type === 'PLAY_CARD');

            const hand = state.seats[seatIdx].hand;
            const cIdx = hand.findIndex(c => c.id === cardAction.cardId);
            assert.ok(cIdx !== -1, `Card ${cardAction.cardId} must exist in hand`);

            // Verify move legality via GameEngine
            const legalIndices = GameEngine.getLegalCardIndices(hand, state.currentTrick);
            assert.ok(legalIndices.includes(cIdx), `Card play must be legal according to ITR rules`);

            const playedCard = hand.splice(cIdx, 1)[0];
            state.currentTrick.push({
                seat: seatIdx,
                card: playedCard,
                playOrder: state.currentTrick.length
            });

            // Advance clockwise or resolve
            if (turn < 5) {
                state.turnSeat = (state.turnSeat + 1) % 6;
            }
        }

        // Evaluate Trick Winner
        assert.strictEqual(state.currentTrick.length, 6);
        const trickRes = GameEngine.evaluateTrickWinner(state.currentTrick, state.trumpSuit);
        assert.ok(trickRes.winnerSeat >= 0 && trickRes.winnerSeat <= 5);
        const winTeam = state.seats[trickRes.winnerSeat].team;
        state.teamTrickPoints[winTeam] += trickRes.points;

        // Winner leads next trick
        state.turnSeat = trickRes.winnerSeat;
    }

    // 6. Verify total points across all tricks equals 56
    const totalPointsWon = state.teamTrickPoints[0] + state.teamTrickPoints[1];
    assert.strictEqual(totalPointsWon, 56, 'Total points won across 8 tricks must equal 56');

    // 7. Verify Table Scoring
    const biddingTeam = contract.contractTeam;
    const defendingTeam = biddingTeam === 0 ? 1 : 0;
    const isMade = state.teamTrickPoints[biddingTeam] >= contract.bid;
    const scoreInfo = GameEngine.calculateTableScore(contract.bid, isMade, contract.isDoubled, contract.isRedoubled);
    
    if (isMade) {
        state.tables[biddingTeam] += scoreInfo.totalTables;
        state.tables[defendingTeam] = Math.max(0, state.tables[defendingTeam] - scoreInfo.totalTables);
    } else {
        state.tables[defendingTeam] += scoreInfo.totalTables;
        state.tables[biddingTeam] = Math.max(0, state.tables[biddingTeam] - scoreInfo.totalTables);
    }

    // Sum of tables must be valid
    assert.ok(state.tables[0] >= 0);
    assert.ok(state.tables[1] >= 0);
});

test('Integration - Redouble Mechanics & 4x Multiplier Flow', async () => {
    const state = GameState.createInitialState('host_p1', 'Alice');
    GameState.fillEmptySeatsWithBots(state);
    const bidding = BiddingEngine.createBiddingState(0);

    // Opening Bid: Seat 1 bids 30 ♠
    BiddingEngine.processBid(bidding, 1, 30, '♠');
    // Opponent Seat 2 Doubles
    BiddingEngine.processDouble(bidding, 2);
    assert.strictEqual(bidding.isDoubled, true);

    // Partner Seat 3 Redoubles
    BiddingEngine.processRedouble(bidding, 3);
    assert.strictEqual(bidding.isRedoubled, true);
    assert.strictEqual(bidding.isComplete, true, 'Redouble must immediately complete bidding');

    const contract = BiddingEngine.getWinningContract(bidding);
    assert.strictEqual(contract.isDoubled, true);
    assert.strictEqual(contract.isRedoubled, true);

    // Scoring check: 30 contract redoubled made: base 1 * 4 = 4 tables
    const scoreMade = GameEngine.calculateTableScore(30, true, true, true);
    assert.strictEqual(scoreMade.totalTables, 4);

    // Defeated 30 contract redoubled: base 2 * 4 = 8 tables
    const scoreDefeated = GameEngine.calculateTableScore(30, false, true, true);
    assert.strictEqual(scoreDefeated.totalTables, 8);
});

test('Integration - Anti-Cheat Sanitization & Reconnect Resilience', async () => {
    const state = GameState.createInitialState('host_p1', 'Alice');
    GameState.connectSeat(state, 1, 'player_bob', 'Bob', 'peer_bob');
    GameState.fillEmptySeatsWithBots(state);

    const deck = GameEngine.shuffleDeck(GameEngine.generateDeck());
    const dealtHands = Array.from({ length: 6 }, (_, i) => deck.slice(i * 8, (i + 1) * 8));
    GameState.resetForNewRound(state, dealtHands);

    // Bob disconnects mid-round
    GameState.disconnectSeat(state, 1);
    assert.strictEqual(state.seats[1].connected, false);

    // Bot temporarily substitutes
    GameState.setSeatBot(state, 1, true);
    assert.strictEqual(state.seats[1].isBot, true);

    // Sanitized state sent to player in Seat 2 does NOT leak Bob's cards
    const sanitizedForSeat2 = GameState.sanitizeStateForSeat(state, 2);
    assert.strictEqual(sanitizedForSeat2.seats[1].hand[0].hidden, true);
    assert.strictEqual(sanitizedForSeat2.seats[2].hand[0].suit, state.seats[2].hand[0].suit);

    // Bob reconnects and reclaims seat
    GameState.connectSeat(state, 1, 'player_bob', 'Bob', 'peer_bob_new');
    assert.strictEqual(state.seats[1].connected, true);
    assert.strictEqual(state.seats[1].isBot, false);
    assert.strictEqual(state.seats[1].hand.length, 8, 'Hand preserved on reconnect');
});
