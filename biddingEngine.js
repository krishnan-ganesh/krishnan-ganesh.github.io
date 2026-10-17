/**
 * 56 Kerala Card Game - Bidding Engine Module
 * Implements the International 56 Ruleset (ITR) for bidding:
 * - Bids require both point value (28–56) and denomination (♠, ♥, ♣, ♦, NT).
 * - Doubling and Redoubling mechanisms.
 * - Redouble immediately concludes the auction.
 * - 5 consecutive passes after bid/double concludes the auction.
 * - Compulsory opening bid (28).
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BiddingEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const MIN_BID = 28;
    const MAX_BID = 56;
    const VALID_SUITS = ['♠', '♥', '♣', '♦', 'NT'];

    /**
     * Initializes a fresh bidding state for a round under International 56 rules.
     * @param {number} dealerSeat (0 to 5)
     * @returns {Object} Bidding state object
     */
    function createBiddingState(dealerSeat = 0) {
        return {
            currentBid: 27,        // Opening bid must be at least 28
            currentSuit: null,     // '♠', '♥', '♣', '♦', or 'NT'
            highBidder: null,
            consecutivePasses: 0,
            turnSeat: (dealerSeat + 1) % 6,
            isDoubled: false,
            doubledBy: null,
            isRedoubled: false,
            redoubledBy: null,
            bids: [],              // History of { seat, type, bid, suit, timestamp }
            isComplete: false
        };
    }

    /**
     * Checks if a proposed bid is valid under ITR rules.
     * @param {Object} state Bidding state
     * @param {number} seatIndex Seat attempting the bid
     * @param {number} bidValue Point value (28–56)
     * @param {string} suit '♠', '♥', '♣', '♦', or 'NT'
     * @returns {boolean}
     */
    function isValidBid(state, seatIndex, bidValue, suit) {
        if (!state || state.isComplete) return false;
        if (state.turnSeat !== seatIndex) return false;
        if (!VALID_SUITS.includes(suit)) return false;

        const val = parseInt(bidValue, 10);
        if (isNaN(val)) return false;
        if (val < MIN_BID || val > MAX_BID) return false;
        if (val <= state.currentBid) return false;

        return true;
    }

    /**
     * Checks if a Double action is legal.
     * Allowed only if opponents hold the current highest bid and it has not been doubled yet.
     * @param {Object} state
     * @param {number} seatIndex
     * @returns {boolean}
     */
    function isValidDouble(state, seatIndex) {
        if (!state || state.isComplete) return false;
        if (state.turnSeat !== seatIndex) return false;
        if (state.highBidder === null) return false;
        if (state.isDoubled) return false;

        // Opponents only (alternating teams: team 0 vs team 1)
        const bidderTeam = state.highBidder % 2;
        const myTeam = seatIndex % 2;
        return bidderTeam !== myTeam;
    }

    /**
     * Checks if a Redouble action is legal.
     * Allowed only if current contract was doubled by opponents and not yet redoubled.
     * Must be called by a player on the declaring team.
     * @param {Object} state
     * @param {number} seatIndex
     * @returns {boolean}
     */
    function isValidRedouble(state, seatIndex) {
        if (!state || state.isComplete) return false;
        if (state.turnSeat !== seatIndex) return false;
        if (!state.isDoubled || state.isRedoubled) return false;

        const bidderTeam = state.highBidder % 2;
        const myTeam = seatIndex % 2;
        return bidderTeam === myTeam;
    }

    /**
     * Checks if a +28 (Plus Suit) conventional bid can be made.
     * In 56, +28 signals a Jack and 2 other cards (3-card suit with Jack).
     */
    function isValidPlus28Bid(state, seatIndex, suit) {
        if (!state || state.isComplete || state.turnSeat !== seatIndex) return false;
        if (!VALID_SUITS.includes(suit)) return false;
        return state.currentBid < 28;
    }

    /**
     * Checks if a +1 (Plus One Suit) single Jack conventional bid can be made.
     * Signals holding a single Jack of that suit and raises bid by 1 point.
     */
    function isValidPlusOneBid(state, seatIndex, suit) {
        if (!state || state.isComplete || state.turnSeat !== seatIndex) return false;
        if (!VALID_SUITS.includes(suit)) return false;
        const nextVal = state.highBidder === null ? 28 : state.currentBid + 1;
        return nextVal <= MAX_BID;
    }

    /**
     * Checks if a +2 (Plus Two Suit) conventional bid can be made.
     * Signals two top cards / strong support and raises bid by 2 points.
     */
    function isValidPlusTwoBid(state, seatIndex, suit) {
        if (!state || state.isComplete || state.turnSeat !== seatIndex) return false;
        if (!VALID_SUITS.includes(suit)) return false;
        const nextVal = state.highBidder === null ? 29 : state.currentBid + 2;
        return nextVal <= MAX_BID;
    }

    /**
     * Processes a valid bid with denomination and optional convention flag.
     * @param {Object} state
     * @param {number} seatIndex
     * @param {number} bidValue
     * @param {string} suit
     * @param {string|null} convention ('PLUS_28' | 'PLUS_1' | 'PLUS_2' | 'STANDARD')
     * @returns {Object} Updated state
     */
    function processBid(state, seatIndex, bidValue, suit, convention = null) {
        if (!isValidBid(state, seatIndex, bidValue, suit)) {
            throw new Error(`Invalid bid ${bidValue} ${suit} by Seat ${seatIndex + 1}. Current high bid is ${state.currentBid}.`);
        }

        const val = parseInt(bidValue, 10);
        state.currentBid = val;
        state.currentSuit = suit;
        state.currentConvention = convention;
        state.highBidder = seatIndex;
        state.isDoubled = false;
        state.doubledBy = null;
        state.isRedoubled = false;
        state.redoubledBy = null;
        state.consecutivePasses = 0;

        state.bids.push({
            seat: seatIndex,
            type: 'BID',
            bid: val,
            suit: suit,
            convention: convention,
            timestamp: Date.now()
        });

        // Advance clockwise
        state.turnSeat = (state.turnSeat + 1) % 6;
        return state;
    }

    function processPlus28Bid(state, seatIndex, suit) {
        return processBid(state, seatIndex, 28, suit, 'PLUS_28');
    }

    function processPlusOneBid(state, seatIndex, suit) {
        const nextVal = state.highBidder === null ? 28 : state.currentBid + 1;
        return processBid(state, seatIndex, nextVal, suit, 'PLUS_1');
    }

    function processPlusTwoBid(state, seatIndex, suit) {
        const nextVal = state.highBidder === null ? 29 : state.currentBid + 2;
        return processBid(state, seatIndex, nextVal, suit, 'PLUS_2');
    }

    /**
     * Processes a Double action by an opponent.
     * @param {Object} state
     * @param {number} seatIndex
     * @returns {Object} Updated state
     */
    function processDouble(state, seatIndex) {
        if (!isValidDouble(state, seatIndex)) {
            throw new Error(`Invalid Double action by Seat ${seatIndex + 1}.`);
        }

        state.isDoubled = true;
        state.doubledBy = seatIndex;
        state.consecutivePasses = 0;

        state.bids.push({
            seat: seatIndex,
            type: 'DOUBLE',
            bid: state.currentBid,
            suit: state.currentSuit,
            timestamp: Date.now()
        });

        // Advance clockwise
        state.turnSeat = (state.turnSeat + 1) % 6;
        return state;
    }

    /**
     * Processes a Redouble action by the contract team.
     * In International 56, a Redouble immediately concludes the bidding!
     * @param {Object} state
     * @param {number} seatIndex
     * @returns {Object} Updated state
     */
    function processRedouble(state, seatIndex) {
        if (!isValidRedouble(state, seatIndex)) {
            throw new Error(`Invalid Redouble action by Seat ${seatIndex + 1}.`);
        }

        state.isRedoubled = true;
        state.redoubledBy = seatIndex;

        state.bids.push({
            seat: seatIndex,
            type: 'REDOUBLE',
            bid: state.currentBid,
            suit: state.currentSuit,
            timestamp: Date.now()
        });

        // Redouble concludes auction immediately!
        state.isComplete = true;
        return state;
    }

    /**
     * Records a pass.
     * Rules:
     * - In ITR, opening player cannot pass (must make compulsory 28 bid).
     * - 5 consecutive passes after at least 1 bid concludes the auction.
     * @param {Object} state
     * @param {number} seatIndex
     * @returns {Object} Updated state
     */
    function processPass(state, seatIndex) {
        if (!state || state.isComplete) return state;
        if (state.turnSeat !== seatIndex) {
            throw new Error(`Cannot pass out of turn. Current turn is Seat ${state.turnSeat + 1}.`);
        }

        // Compulsory opening bid safeguard: if no bids yet, opening player must bid 28
        if (state.highBidder === null && state.bids.length === 0) {
            throw new Error(`Opening player (Seat ${seatIndex + 1}) must make a compulsory bid of at least 28.`);
        }

        state.consecutivePasses++;
        state.bids.push({
            seat: seatIndex,
            type: 'PASS',
            timestamp: Date.now()
        });

        // 5 consecutive passes after a bid completes the auction
        if (state.highBidder !== null && state.consecutivePasses >= 5) {
            state.isComplete = true;
            return state;
        }

        state.turnSeat = (state.turnSeat + 1) % 6;
        return state;
    }

    /**
     * Returns winning contract details if bidding is complete.
     * @param {Object} state
     * @returns {Object|null}
     */
    function getWinningContract(state) {
        if (!state || !state.isComplete || state.highBidder === null) {
            return null;
        }
        return {
            highBidder: state.highBidder,
            bid: state.currentBid,
            suit: state.currentSuit,
            convention: state.currentConvention || null,
            contractTeam: state.highBidder % 2,
            isDoubled: !!state.isDoubled,
            doubledBy: state.doubledBy,
            isRedoubled: !!state.isRedoubled,
            redoubledBy: state.redoubledBy
        };
    }

    /**
     * Reconstitutes bidding engine state from a restored game state snapshot.
     * @param {Object} state Restored table game state
     * @returns {Object} Bidding state object
     */
    function restoreBiddingState(state) {
        let consecutivePasses = typeof state.consecutivePasses === 'number' ? state.consecutivePasses : 0;
        if (consecutivePasses === 0 && Array.isArray(state.bids) && state.bids.length > 0) {
            for (let i = state.bids.length - 1; i >= 0; i--) {
                if (state.bids[i] && state.bids[i].type === 'PASS') {
                    consecutivePasses++;
                } else {
                    break;
                }
            }
        }

        return {
            currentBid: state.highBid || 27,
            currentSuit: state.trumpSuit || null,
            currentConvention: state.convention || null,
            highBidder: state.highBidder !== undefined ? state.highBidder : null,
            consecutivePasses: consecutivePasses,
            turnSeat: state.turnSeat !== undefined ? state.turnSeat : 1,
            isDoubled: !!state.isDoubled,
            doubledBy: state.doubledBy !== undefined ? state.doubledBy : null,
            isRedoubled: !!state.isRedoubled,
            redoubledBy: state.redoubledBy !== undefined ? state.redoubledBy : null,
            bids: state.bids ? [...state.bids] : [],
            isComplete: state.phase !== 'BIDDING'
        };
    }

    return {
        MIN_BID,
        MAX_BID,
        VALID_SUITS,
        createBiddingState,
        isValidBid,
        isValidPlus28Bid,
        isValidPlusOneBid,
        isValidPlusTwoBid,
        isValidDouble,
        isValidRedouble,
        processBid,
        processPlus28Bid,
        processPlusOneBid,
        processPlusTwoBid,
        processDouble,
        processRedouble,
        processPass,
        getWinningContract,
        restoreBiddingState
    };
}));
