/**
 * 56 Kerala Card Game - Game Engine Module
 * Pure functional game rules conforming to International 56 Ruleset (ITR).
 * 48-card double deck, suit following, No Trump (NT) support,
 * duplicate card precedence, trick evaluation, and table scoring.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GameEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    // 56 Card Game Constants
    const SUITS = { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' };
    const SUIT_NAMES = { '♠': 'Spades', '♥': 'Hearts', '♦': 'Dice (Diamonds)', '♣': 'Clubs', 'NT': 'No Trump' };
    const BID_DENOMINATIONS = ['♠', '♥', '♣', '♦', 'NT'];
    
    // Rank order in 56: Jack (highest), 9, Ace, 10, King, Queen (lowest)
    const CARD_ORDER = ['J', '9', 'A', '10', 'K', 'Q'];
    const RANK_POWER = { 'J': 6, '9': 5, 'A': 4, '10': 3, 'K': 2, 'Q': 1 };
    
    // Point values: J=3, 9=2, A=1, 10=1, K=0, Q=0
    // Total in double deck: 8*3 + 8*2 + 8*1 + 8*1 = 24 + 16 + 8 + 8 = 56 points!
    const CARD_POINTS = { 'J': 3, '9': 2, 'A': 1, '10': 1, 'K': 0, 'Q': 0 };

    /**
     * Generates standard 48-card deck for 56 (2 copies of 24 cards).
     * @returns {Array} Array of card objects
     */
    function generateDeck() {
        const deck = [];
        for (let copy = 0; copy < 2; copy++) {
            for (let suit in SUITS) {
                for (let val of CARD_ORDER) {
                    deck.push({
                        id: `${suit}_${val}_${copy}`,
                        suit: suit,
                        value: val,
                        points: CARD_POINTS[val],
                        rank: RANK_POWER[val],
                        color: SUITS[suit],
                        copy: copy
                    });
                }
            }
        }
        return deck;
    }

    /**
     * Fisher-Yates shuffle algorithm.
     * @param {Array} deck
     * @returns {Array} Shuffled deck
     */
    function shuffleDeck(deck) {
        const d = [...deck];
        for (let i = d.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [d[i], d[j]] = [d[j], d[i]];
        }
        return d;
    }

    /**
     * Sorts cards in hand by suit and rank.
     * @param {Array} hand
     * @returns {Array} Sorted hand
     */
    function sortHand(hand) {
        if (!hand || hand.length === 0) return [];
        const suitOrder = ['♠', '♥', '♣', '♦'];
        return [...hand].sort((a, b) => {
            if (a.suit !== b.suit) {
                return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
            }
            return CARD_ORDER.indexOf(a.value) - CARD_ORDER.indexOf(b.value);
        });
    }

    /**
     * Computes which cards in hand are legally playable under International 56 rules:
     * 1. If leading the trick (trick is empty):
     *    - Player may lead ANY card in hand.
     * 2. If following a trick (trick has cards):
     *    - Must follow the lead suit if player holds any cards of that suit.
     *    - If void in the lead suit, player may play ANY card (trump or any discard).
     * @param {Array} hand
     * @param {Array} currentTrick Array of { seat, card, playOrder }
     * @returns {Array<number>} Indices of legal cards in hand
     */
    function getLegalCardIndices(hand, currentTrick) {
        if (!hand || hand.length === 0) return [];

        // Leading the trick: any card is legal
        if (!currentTrick || currentTrick.length === 0) {
            return hand.map((_, i) => i);
        }

        // Following the trick: must follow lead suit if held
        const leadSuit = currentTrick[0].card.suit;
        const hasLeadSuit = hand.some(c => c.suit === leadSuit);

        if (hasLeadSuit) {
            return hand.map((c, i) => c.suit === leadSuit ? i : -1).filter(i => i !== -1);
        } else {
            // Void in lead suit: can play any card (trump or discard)
            return hand.map((_, i) => i);
        }
    }

    /**
     * Evaluates the winning card and points of a completed trick under International 56 rules:
     * - If trump contract (♠, ♥, ♣, ♦):
     *   - Highest trump played wins.
     *   - If no trumps played, highest card of lead suit wins.
     * - If No Trump ('NT'):
     *   - There are no trumps; highest card of lead suit wins.
     * - Duplicate Card Precedence:
     *   - When two identical cards (e.g. two ♠J) are played, the one played EARLIER wins!
     * @param {Array} trick Array of { seat, card, playOrder }
     * @param {string} trumpSuit ('♠'|'♥'|'♦'|'♣'|'NT')
     * @returns {Object} { winnerSeat, points, winningCard }
     */
    function evaluateTrickWinner(trick, trumpSuit) {
        if (!trick || trick.length === 0) return null;
        const leadSuit = trick[0].card.suit;
        const isTrumpContract = trumpSuit && trumpSuit !== 'NT';
        let winningEntry = trick[0];

        for (let i = 1; i < trick.length; i++) {
            const entry = trick[i];
            const bestCard = winningEntry.card;
            const curCard = entry.card;

            const isBestTrump = isTrumpContract && bestCard.suit === trumpSuit;
            const isCurTrump = isTrumpContract && curCard.suit === trumpSuit;

            if (isCurTrump && !isBestTrump) {
                winningEntry = entry;
            } else if (isCurTrump && isBestTrump) {
                // Both are trump: higher rank wins; if identical rank, earlier played holds
                if (curCard.rank > bestCard.rank) {
                    winningEntry = entry;
                }
            } else if (!isBestTrump) {
                // Neither is trump (or NT contract): must match lead suit to compete
                if (curCard.suit === leadSuit) {
                    if (bestCard.suit !== leadSuit || curCard.rank > bestCard.rank) {
                        winningEntry = entry;
                    }
                }
            }
        }

        const points = trick.reduce((sum, item) => sum + (item.card.points || 0), 0);
        return {
            winnerSeat: winningEntry.seat,
            points: points,
            winningCard: winningEntry.card
        };
    }

    /**
     * Calculates tables won or lost for a contract under International 56 rules:
     * Base Table Scale:
     * - 28 to 39: Made = 1 table, Defeated = 2 tables
     * - 40 to 47: Made = 2 tables, Defeated = 3 tables (Honours)
     * - 48 to 55: Made = 3 tables, Defeated = 4 tables
     * - 56: Made = 4 tables, Defeated = 5 tables (Thani)
     * 
     * Multipliers:
     * - Doubled: x2
     * - Redoubled: x4
     * 
     * @param {number} contractBid (28 to 56)
     * @param {boolean} isMade True if declaring team captured >= contractBid
     * @param {boolean} isDoubled
     * @param {boolean} isRedoubled
     * @returns {Object} { baseTables, multiplier, totalTables }
     */
    function calculateTableScore(contractBid, isMade, isDoubled = false, isRedoubled = false) {
        let baseTables = 1;
        if (contractBid >= 56) {
            baseTables = isMade ? 4 : 5;
        } else if (contractBid >= 48) {
            baseTables = isMade ? 3 : 4;
        } else if (contractBid >= 40) {
            baseTables = isMade ? 2 : 3;
        } else {
            baseTables = isMade ? 1 : 2;
        }

        let multiplier = 1;
        if (isRedoubled) {
            multiplier = 4;
        } else if (isDoubled) {
            multiplier = 2;
        }

        return {
            baseTables,
            multiplier,
            totalTables: baseTables * multiplier
        };
    }

    return {
        SUITS,
        SUIT_NAMES,
        BID_DENOMINATIONS,
        CARD_ORDER,
        RANK_POWER,
        CARD_POINTS,
        generateDeck,
        shuffleDeck,
        sortHand,
        getLegalCardIndices,
        evaluateTrickWinner,
        calculateTableScore
    };
}));
