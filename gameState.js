/**
 * 56 Kerala Card Game - Game State Module
 * Central table state for International 56 Ruleset (ITR):
 * - 6-seat roster, 12 starting Tables per team.
 * - Declarative auction phase with Doubled/Redoubled flags.
 * - Immediate transition from BIDDING to PLAYING with known trump / NT.
 * - Anti-cheat hand sanitization for peer networking.
 * - Session persistence with localStorage.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GameState = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const STORAGE_KEY_HOST_STATE = 'k56_host_state';

    /**
     * Creates initial state for 6 seats and starting 12 tables per team.
     * Team 0 (Red): Seats 0, 2, 4
     * Team 1 (Blue): Seats 1, 3, 5
     * @param {string} hostPlayerId
     * @param {string} hostPlayerName
     * @returns {Object}
     */
    function createInitialState(hostPlayerId, hostPlayerName = 'Host') {
        const seats = [];
        for (let i = 0; i < 6; i++) {
            seats.push({
                seatIndex: i,
                team: i % 2, // 0 for Red, 1 for Blue
                name: i === 0 ? hostPlayerName : `Player ${i + 1}`,
                playerId: i === 0 ? hostPlayerId : null,
                peerId: null,
                connected: i === 0,
                isBot: false,
                hand: [],
                disconnectTime: null
            });
        }

        return {
            phase: 'LOBBY', // 'LOBBY' | 'BIDDING' | 'PLAYING' | 'ROUND_OVER'
            roundNumber: 1,
            dealerSeat: 0,
            turnSeat: 1,
            highBid: 27,
            highBidder: null,
            trumpSuit: null,     // '♠', '♥', '♣', '♦', or 'NT'
            isDoubled: false,
            doubledBy: null,
            isRedoubled: false,
            redoubledBy: null,
            bids: [],
            consecutivePasses: 0,
            currentTrick: [],    // [{ seat, card, playOrder }]
            trickNumber: 1,
            teamTrickPoints: { 0: 0, 1: 0 },
            tables: { 0: 12, 1: 12 }, // Starting 12 tables per team in International 56
            matchScore: { 0: 0, 1: 0 },
            seats: seats
        };
    }

    function findSeatByPlayerId(state, playerId) {
        if (!state || !state.seats || !playerId) return -1;
        return state.seats.findIndex(s => s.playerId === playerId);
    }

    function findVacantSeat(state) {
        if (!state || !state.seats) return -1;
        return state.seats.findIndex(s => !s.connected && !s.playerId && s.seatIndex !== 0);
    }

    function connectSeat(state, seatIndex, playerId, name, peerId) {
        const seat = state.seats[seatIndex];
        if (!seat) return;

        seat.playerId = playerId;
        if (name && name.trim() && name !== 'Player') {
            seat.name = name.trim();
        } else if (seatIndex === 0) {
            seat.name = name || 'Host';
        } else {
            seat.name = `Player ${seatIndex + 1}`;
        }
        seat.peerId = peerId;
        seat.connected = true;
        seat.isBot = false;
        seat.disconnectTime = null;
    }

    function disconnectSeat(state, seatIndex) {
        const seat = state.seats[seatIndex];
        if (!seat) return;

        seat.connected = false;
        seat.peerId = null;
        seat.disconnectTime = Date.now();
    }

    function setSeatBot(state, seatIndex, isBot) {
        const seat = state.seats[seatIndex];
        if (!seat) return;
        seat.isBot = isBot;
    }

    function fillEmptySeatsWithBots(state) {
        const botNames = ['Arun Bot', 'Deepa Bot', 'Manu Bot', 'Sita Bot', 'Kiran Bot'];
        let botIdx = 0;

        state.seats.forEach((seat) => {
            if (seat.seatIndex !== 0 && !seat.connected) {
                seat.name = botNames[botIdx++] || `Bot ${seat.seatIndex + 1}`;
                seat.isBot = true;
                seat.connected = true;
                seat.playerId = `bot_${seat.seatIndex}`;
                seat.disconnectTime = null;
            }
        });
    }

    /**
     * Resets state for a new deal under International 56 rules.
     * @param {Object} state
     * @param {Array} dealtHands
     */
    function resetForNewRound(state, dealtHands) {
        state.phase = 'BIDDING';
        state.highBid = 27;
        state.highBidder = null;
        state.trumpSuit = null;
        state.isDoubled = false;
        state.doubledBy = null;
        state.isRedoubled = false;
        state.redoubledBy = null;
        state.bids = [];
        state.consecutivePasses = 0;
        state.currentTrick = [];
        state.trickNumber = 1;
        state.teamTrickPoints = { 0: 0, 1: 0 };

        state.seats.forEach((seat, idx) => {
            seat.hand = dealtHands[idx] || [];
        });

        // First bidder is clockwise of dealer
        state.turnSeat = (state.dealerSeat + 1) % 6;
    }

    /**
     * Starts trick play directly from winning contract (no secret trump phase).
     * @param {Object} state
     * @param {Object} contract Winning contract details
     */
    function startTrickPlay(state, contract) {
        state.phase = 'PLAYING';
        state.highBid = contract.bid;
        state.highBidder = contract.highBidder;
        state.trumpSuit = contract.suit;
        state.convention = contract.convention || null;
        state.isDoubled = !!contract.isDoubled;
        state.doubledBy = contract.doubledBy || null;
        state.isRedoubled = !!contract.isRedoubled;
        state.redoubledBy = contract.redoubledBy || null;
        state.currentTrick = [];
        state.trickNumber = 1;
        // Opening leader is player to dealer's right (first bidder)
        state.turnSeat = (state.dealerSeat + 1) % 6;
    }

    /**
     * Advances to the next round: rotates dealer and sets phase to LOBBY.
     * @param {Object} state
     */
    function advanceDealerForNextRound(state) {
        state.dealerSeat = (state.dealerSeat + 1) % 6;
        state.roundNumber++;
        state.phase = 'LOBBY';
        state.currentTrick = [];
        state.seats.forEach(s => s.hand = []);
    }

    /**
     * Sanitizes full game state before sending over P2P network to a player.
     * @param {Object} state
     * @param {number} seatIndex
     * @returns {Object}
     */
    function sanitizeStateForSeat(state, seatIndex) {
        if (!state) return null;

        return {
            ...state,
            seats: state.seats.map(s => ({
                seatIndex: s.seatIndex,
                team: s.team,
                name: s.name,
                playerId: s.playerId,
                connected: s.connected,
                isBot: s.isBot,
                disconnectTime: s.disconnectTime,
                hand: s.seatIndex === seatIndex
                    ? s.hand
                    : (s.hand || []).map(() => ({ hidden: true }))
            }))
        };
    }

    function saveToStorage(state, key = STORAGE_KEY_HOST_STATE) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, JSON.stringify(state));
            }
        } catch (e) {
            console.warn('Failed to save state to localStorage', e);
        }
    }

    function loadFromStorage(key = STORAGE_KEY_HOST_STATE) {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(key);
                if (raw) return JSON.parse(raw);
            }
        } catch (e) {
            console.warn('Failed to load state from localStorage', e);
        }
        return null;
    }

    function clearStorage(key = STORAGE_KEY_HOST_STATE) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            }
        } catch (e) {}
    }

    return {
        createInitialState,
        findSeatByPlayerId,
        findVacantSeat,
        connectSeat,
        disconnectSeat,
        setSeatBot,
        fillEmptySeatsWithBots,
        resetForNewRound,
        startTrickPlay,
        advanceDealerForNextRound,
        sanitizeStateForSeat,
        saveToStorage,
        loadFromStorage,
        clearStorage
    };
}));
