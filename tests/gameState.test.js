/**
 * Unit Tests for gameState.js
 * International 56 Ruleset (ITR) Game State & Networking Sanitization
 */
const test = require('node:test');
const assert = require('node:assert');
const GameState = require('../gameState.js');

test('GameState - Initial State and Table Setup', async (t) => {
    await t.test('initializes with 6 seats and starting 12 tables per team', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        assert.strictEqual(state.seats.length, 6, 'Must have 6 seats');
        assert.strictEqual(state.tables[0], 12, 'Team 0 starts with 12 tables');
        assert.strictEqual(state.tables[1], 12, 'Team 1 starts with 12 tables');
        assert.strictEqual(state.phase, 'LOBBY');
        assert.strictEqual(state.dealerSeat, 0);

        // Check alternating teams: Red (0) and Blue (1)
        state.seats.forEach((seat, i) => {
            assert.strictEqual(seat.seatIndex, i);
            assert.strictEqual(seat.team, i % 2, `Seat ${i} team must be ${i % 2}`);
        });

        // Host seat 0 is connected
        assert.strictEqual(state.seats[0].connected, true);
        assert.strictEqual(state.seats[0].playerId, 'host_p1');
    });

    await t.test('fillEmptySeatsWithBots populates vacant seats with bots', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        GameState.fillEmptySeatsWithBots(state);

        for (let i = 1; i < 6; i++) {
            assert.strictEqual(state.seats[i].connected, true);
            assert.strictEqual(state.seats[i].isBot, true);
            assert.ok(state.seats[i].playerId.startsWith('bot_'));
        }
    });
});

test('GameState - Deal & Round State Transitions', async (t) => {
    await t.test('resetForNewRound distributes 8 cards per player and sets turn', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        const dummyHands = Array.from({ length: 6 }, (_, s) =>
            Array.from({ length: 8 }, (_, c) => ({ id: `card_${s}_${c}` }))
        );

        GameState.resetForNewRound(state, dummyHands);
        assert.strictEqual(state.phase, 'BIDDING');
        assert.strictEqual(state.turnSeat, 1, 'First bidder is dealer + 1');
        assert.strictEqual(state.highBid, 27);
        assert.strictEqual(state.highBidder, null);
        assert.strictEqual(state.trumpSuit, null);
        assert.strictEqual(state.teamTrickPoints[0], 0);
        assert.strictEqual(state.teamTrickPoints[1], 0);

        for (let i = 0; i < 6; i++) {
            assert.strictEqual(state.seats[i].hand.length, 8);
        }
    });

    await t.test('startTrickPlay transitions directly to PLAYING with open trump', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        const contract = {
            bid: 32,
            suit: '♠',
            highBidder: 3,
            contractTeam: 1,
            isDoubled: true,
            doubledBy: 2,
            isRedoubled: false,
            redoubledBy: null
        };

        GameState.startTrickPlay(state, contract);
        assert.strictEqual(state.phase, 'PLAYING');
        assert.strictEqual(state.highBid, 32);
        assert.strictEqual(state.highBidder, 3);
        assert.strictEqual(state.trumpSuit, '♠');
        assert.strictEqual(state.isDoubled, true);
        assert.strictEqual(state.isRedoubled, false);
        assert.strictEqual(state.trickNumber, 1);
        assert.strictEqual(state.turnSeat, 1, 'Opening leader is player to dealer right (seat 1)');
    });
});

test('GameState - Anti-Cheat State Sanitization', async (t) => {
    await t.test('sanitizeStateForSeat keeps local seat hand and hides opponent hands', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        const dummyHands = Array.from({ length: 6 }, (_, s) => [
            { id: `card_${s}_0`, suit: '♠', value: 'J' },
            { id: `card_${s}_1`, suit: '♥', value: '9' }
        ]);
        GameState.resetForNewRound(state, dummyHands);

        // Sanitize for Seat 2
        const sanitized = GameState.sanitizeStateForSeat(state, 2);
        
        // Seat 2 sees its own cards plainly
        assert.strictEqual(sanitized.seats[2].hand[0].suit, '♠');
        assert.strictEqual(sanitized.seats[2].hand[0].value, 'J');

        // Other seats must have hidden cards
        [0, 1, 3, 4, 5].forEach(seatIdx => {
            const h = sanitized.seats[seatIdx].hand;
            assert.strictEqual(h.length, 2);
            assert.strictEqual(h[0].hidden, true);
            assert.strictEqual(h[0].suit, undefined);
            assert.strictEqual(h[0].value, undefined);
        });
    });
});

test('GameState - Multiplayer Join and Seat Assignment', async (t) => {
    await t.test('findVacantSeat finds next open seat (Seat 1) and never Seat 0', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        const vacantSeat = GameState.findVacantSeat(state);
        assert.strictEqual(vacantSeat, 1, 'First vacant seat must be Seat 1, not Host Seat 0');
    });

    await t.test('connectSeat assigns distinct default names when default Player is provided', () => {
        const state = GameState.createInitialState('host_p1', 'Alice Host');
        GameState.connectSeat(state, 1, 'p2_id', 'Player', 'peer_2');
        assert.strictEqual(state.seats[1].name, 'Player 2', 'Default name for seat 1 must be Player 2');

        GameState.connectSeat(state, 2, 'p3_id', '', 'peer_3');
        assert.strictEqual(state.seats[2].name, 'Player 3', 'Empty name for seat 2 must be Player 3');

        GameState.connectSeat(state, 3, 'p4_id', 'Custom Bob', 'peer_4');
        assert.strictEqual(state.seats[3].name, 'Custom Bob', 'Custom name must be preserved');
    });

    await t.test('simulates lobby join with null requestedSeat without error', () => {
        const hostState = GameState.createInitialState('host_p1', 'Alice Host');
        const requestedSeat = null;

        let targetSeat = -1;
        if (typeof requestedSeat === 'number' && requestedSeat > 0 && requestedSeat < 6 && hostState.seats[requestedSeat] && !hostState.seats[requestedSeat].connected && !hostState.seats[requestedSeat].playerId) {
            targetSeat = requestedSeat;
        } else {
            targetSeat = GameState.findVacantSeat(hostState);
        }

        assert.strictEqual(targetSeat, 1);
        GameState.connectSeat(hostState, targetSeat, 'p_browser2', 'Player', 'peer_b2');
        assert.strictEqual(hostState.seats[1].connected, true);
        assert.strictEqual(hostState.seats[1].name, 'Player 2');
        assert.strictEqual(hostState.seats[1].playerId, 'p_browser2');
    });

    await t.test('remote client handshake prevents taking Host Seat 0 on ID collision', () => {
        const hostState = GameState.createInitialState('host_p1', 'Alice Host');
        // Remote client brings the same playerId as the host (e.g. from shared storage)
        const incomingPlayerId = 'host_p1';
        let seatIndex = GameState.findSeatByPlayerId(hostState, incomingPlayerId);

        // Security / logic rule: remote peer must NEVER take Seat 0
        const isAllowedReconnect = seatIndex > 0;
        assert.strictEqual(isAllowedReconnect, false, 'Remote peer cannot reconnect to Seat 0');

        // Instead, assign an available seat
        const targetSeat = GameState.findVacantSeat(hostState);
        assert.strictEqual(targetSeat, 1);
        GameState.connectSeat(hostState, targetSeat, 'p_new_client', 'Player', 'peer_client');
        assert.strictEqual(hostState.seats[0].playerId, 'host_p1', 'Host Seat 0 remains untouched');
        assert.strictEqual(hostState.seats[1].playerId, 'p_new_client', 'Client gets Seat 1');
    });
});
