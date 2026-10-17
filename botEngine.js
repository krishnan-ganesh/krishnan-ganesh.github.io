/**
 * 56 Kerala Card Game - Bot Engine Module
 * Implements autonomous AI decision making for International 56 Ruleset (ITR):
 * - Bidding point values and suit/NT denominations.
 * - Doubling and Redoubling challenges.
 * - Open trump awareness from trick 1 (No Trump & Trump contracts).
 * - Partner cooperation, trick cutting, point feeding, and sloughing.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        const GameEngine = require('./gameEngine.js');
        module.exports = factory(GameEngine);
    } else {
        root.BotEngine = factory(root.GameEngine);
    }
}(typeof self !== 'undefined' ? self : this, function(GameEngine) {
    'use strict';

    /**
     * Evaluates a player hand for card point counts, suit lengths, and high card distribution.
     * @param {Array} hand Array of card objects
     * @returns {Object} Hand analytics
     */
    function evaluateHand(hand) {
        const suits = ['♠', '♥', '♣', '♦'];
        const counts = { '♠': 0, '♥': 0, '♣': 0, '♦': 0 };
        const points = { '♠': 0, '♥': 0, '♣': 0, '♦': 0 };
        const jacks = { '♠': 0, '♥': 0, '♣': 0, '♦': 0 };
        const nines = { '♠': 0, '♥': 0, '♣': 0, '♦': 0 };
        let totalPoints = 0;

        (hand || []).forEach(card => {
            counts[card.suit] = (counts[card.suit] || 0) + 1;
            points[card.suit] = (points[card.suit] || 0) + (card.points || 0);
            totalPoints += (card.points || 0);
            if (card.value === 'J') jacks[card.suit] = (jacks[card.suit] || 0) + 1;
            if (card.value === '9') nines[card.suit] = (nines[card.suit] || 0) + 1;
        });

        // Determine best suit for trump based on length and high power cards
        let bestSuit = '♠';
        let maxScore = -1;
        suits.forEach(s => {
            const score = (counts[s] * 3) + (points[s] * 2) + (jacks[s] * 4) + (nines[s] * 2);
            if (score > maxScore) {
                maxScore = score;
                bestSuit = s;
            }
        });

        // Balanced hand indicator for No Trump (NT)
        const suitsWithHighCards = suits.filter(s => jacks[s] > 0 || points[s] >= 2).length;
        const isBalancedForNT = suitsWithHighCards >= 3 && totalPoints >= 13;

        // Specific International 56 Bidding Conventions:
        // 1. "+28" (Plus Suit): Jack and 2 other cards (3 cards total with Jack)
        const plus28Suits = suits.filter(s => counts[s] === 3 && jacks[s] >= 1);
        // 2. "+1" (Single Jack): Holding exactly a single Jack in that suit
        const singleJackSuits = suits.filter(s => counts[s] === 1 && jacks[s] === 1);

        return {
            counts,
            points,
            jacks,
            nines,
            totalPoints,
            bestSuit,
            bestSuitScore: maxScore,
            isBalancedForNT,
            plus28Suits,
            singleJackSuits
        };
    }

    /**
     * Decides whether the bot should bid, double, redouble, or pass under ITR rules.
     * Incorporates official 56 conventions (+28 Hearts for J+2 cards, +1 Dice for single J).
     * @param {number} seatIndex
     * @param {Object} state Full game state
     * @param {Object} biddingState Current BiddingEngine state
     * @returns {Object} { type: 'BID', bid, suit, convention } | { type: 'DOUBLE' } | { type: 'REDOUBLE' } | { type: 'PASS' }
     */
    function decideBid(seatIndex, state, biddingState) {
        const hand = (state.seats && state.seats[seatIndex]) ? state.seats[seatIndex].hand : [];
        const analysis = evaluateHand(hand);
        const curBid = (biddingState && biddingState.currentBid) ? biddingState.currentBid : (state.highBid || 27);
        const myTeam = seatIndex % 2;
        const chosenSuit = analysis.isBalancedForNT ? 'NT' : analysis.bestSuit;

        // Compulsory opening bid safeguard (ITR rule: opening player must bid at least 28)
        if (!biddingState || biddingState.highBidder === null) {
            // If bot has a suit with Jack and 2 other cards, use the +28 convention!
            if (analysis.plus28Suits.length > 0) {
                return {
                    type: 'BID',
                    bid: 28,
                    suit: analysis.plus28Suits[0],
                    convention: 'PLUS_28'
                };
            }
            return {
                type: 'BID',
                bid: 28,
                suit: chosenSuit,
                convention: 'STANDARD'
            };
        }

        const highBidder = biddingState.highBidder;
        const bidderTeam = highBidder % 2;

        // Redouble Check: if our team holds high bid and was doubled
        if (bidderTeam === myTeam && biddingState.isDoubled && !biddingState.isRedoubled) {
            if (analysis.totalPoints >= 14 || analysis.bestSuitScore >= 18) {
                return { type: 'REDOUBLE' };
            }
        }

        // Avoid overbidding partner
        if (bidderTeam === myTeam) {
            return { type: 'PASS' };
        }

        // Double Check: if opponents hold high contract and bot has heavy defense
        if (bidderTeam !== myTeam && !biddingState.isDoubled && curBid >= 36) {
            const oppSuit = biddingState.currentSuit;
            const oppSuitTrumpCount = oppSuit ? (analysis.counts[oppSuit] || 0) : 0;
            if (analysis.totalPoints >= 14 || oppSuitTrumpCount >= 3) {
                return { type: 'DOUBLE' };
            }
        }

        // Response with +1 [suit] if bot has a Single Jack in a suit (e.g. +1 Dice)
        if (analysis.singleJackSuits.length > 0 && curBid < 34) {
            const sjSuit = analysis.singleJackSuits[0];
            return {
                type: 'BID',
                bid: curBid + 1,
                suit: sjSuit,
                convention: 'PLUS_1'
            };
        }

        // Competitive Bidding Check
        const targetBid = curBid + 1;
        const minPointsNeeded = 11 + (targetBid - 28) * 2;

        if (targetBid <= 34 && analysis.totalPoints >= minPointsNeeded && analysis.counts[analysis.bestSuit] >= 3) {
            return {
                type: 'BID',
                bid: targetBid,
                suit: chosenSuit,
                convention: 'STANDARD'
            };
        }

        return { type: 'PASS' };
    }

    /**
     * Decides card play for the bot during the trick phase under International 56 rules.
     * Open trump awareness from trick 1.
     * @param {number} seatIndex
     * @param {Object} state Full game state
     * @returns {Object|null} { type: 'PLAY_CARD', cardId: string }
     */
    function decideCardPlay(seatIndex, state) {
        const seat = state.seats[seatIndex];
        if (!seat || !seat.hand || seat.hand.length === 0) return null;

        const hand = seat.hand;
        const currentTrick = state.currentTrick || [];
        const trumpSuit = state.trumpSuit;
        const isTrumpContract = trumpSuit && trumpSuit !== 'NT';
        const myTeam = seatIndex % 2;

        // Compute legal cards using GameEngine
        const legalIndices = GameEngine.getLegalCardIndices(hand, currentTrick);
        if (legalIndices.length === 0) return null;

        // -------------------------------------------------------------
        // Case 1: Bot leads the trick
        // -------------------------------------------------------------
        if (currentTrick.length === 0) {
            // If trump contract and bot has Jack of trump, lead it to draw trumps
            if (isTrumpContract) {
                const highTrump = legalIndices.map(i => hand[i])
                    .find(c => c.suit === trumpSuit && (c.value === 'J' || c.value === '9'));
                if (highTrump) {
                    return { type: 'PLAY_CARD', cardId: highTrump.id };
                }
            }

            // Lead non-trump Ace if held
            const aces = legalIndices.map(i => hand[i])
                .filter(c => c.value === 'A' && (!isTrumpContract || c.suit !== trumpSuit));
            if (aces.length > 0) {
                return { type: 'PLAY_CARD', cardId: aces[0].id };
            }

            // Lead lowest card from longest non-trump suit
            const analysis = evaluateHand(hand);
            const nonTrumps = legalIndices.map(i => hand[i])
                .filter(c => !isTrumpContract || c.suit !== trumpSuit);
            if (nonTrumps.length > 0) {
                nonTrumps.sort((a, b) => (analysis.counts[b.suit] - analysis.counts[a.suit]) || (a.rank - b.rank));
                return { type: 'PLAY_CARD', cardId: nonTrumps[0].id };
            }

            return { type: 'PLAY_CARD', cardId: hand[legalIndices[0]].id };
        }

        // -------------------------------------------------------------
        // Case 2: Following the trick
        // -------------------------------------------------------------
        const leadSuit = currentTrick[0].card.suit;
        const hasLeadSuit = hand.some(c => c.suit === leadSuit);
        const trickEvaluation = GameEngine.evaluateTrickWinner(currentTrick, trumpSuit);
        const winningSeat = trickEvaluation ? trickEvaluation.winnerSeat : currentTrick[0].seat;
        const isPartnerWinning = (winningSeat % 2 === myTeam);
        const winningCard = trickEvaluation ? trickEvaluation.winningCard : currentTrick[0].card;

        // 2A: Void in lead suit
        if (!hasLeadSuit) {
            // Trump contract: can cut if opponent is winning
            if (isTrumpContract) {
                const trumpCards = legalIndices.map(i => hand[i]).filter(c => c.suit === trumpSuit);

                if (!isPartnerWinning && trumpCards.length > 0) {
                    const winningIsTrump = winningCard.suit === trumpSuit;
                    // Find lowest winning trump
                    const canCut = trumpCards.filter(c => !winningIsTrump || c.rank > winningCard.rank)
                        .sort((a, b) => a.rank - b.rank);
                    if (canCut.length > 0) {
                        return { type: 'PLAY_CARD', cardId: canCut[0].id };
                    }
                }
            }

            // If partner is winning, or cannot beat, discard lowest-point card
            const discards = legalIndices.map(i => hand[i])
                .sort((a, b) => a.points - b.points || a.rank - b.rank);
            return { type: 'PLAY_CARD', cardId: discards[0].id };
        }

        // 2B: Holding lead suit (must follow)
        const legalLeadCards = legalIndices.map(i => hand[i]).filter(c => c.suit === leadSuit);

        if (isPartnerWinning) {
            // Partner is winning: if high card won and trick nearing end, feed point cards
            const isHighWin = winningCard.value === 'J' || (isTrumpContract && winningCard.suit === trumpSuit && winningCard.rank >= 5);
            if (isHighWin && currentTrick.length >= 4) {
                legalLeadCards.sort((a, b) => b.points - a.points);
                return { type: 'PLAY_CARD', cardId: legalLeadCards[0].id };
            }
            // Otherwise save high cards by playing lowest rank
            legalLeadCards.sort((a, b) => a.rank - b.rank);
            return { type: 'PLAY_CARD', cardId: legalLeadCards[0].id };
        } else {
            // Opponent is winning: try to capture with lowest winning card
            const winningIsTrump = isTrumpContract && winningCard.suit === trumpSuit;
            const canBeat = legalLeadCards.filter(c => !winningIsTrump && c.rank > winningCard.rank)
                .sort((a, b) => a.rank - b.rank);

            if (canBeat.length > 0) {
                return { type: 'PLAY_CARD', cardId: canBeat[0].id };
            } else {
                // Cannot win: play lowest rank to conserve cards
                legalLeadCards.sort((a, b) => a.rank - b.rank);
                return { type: 'PLAY_CARD', cardId: legalLeadCards[0].id };
            }
        }
    }

    /**
     * Master dispatcher for autonomous bot moves across all game phases.
     * @param {number} seatIndex
     * @param {Object} state Full game state
     * @param {Object} biddingState Current BiddingEngine state
     * @returns {Object|null}
     */
    function computeBotAction(seatIndex, state, biddingState) {
        if (!state) return null;
        const currentTurn = (state.phase === 'BIDDING' && biddingState && biddingState.turnSeat !== undefined)
            ? biddingState.turnSeat
            : state.turnSeat;
        if (currentTurn !== seatIndex) return null;

        if (state.phase === 'BIDDING') {
            return decideBid(seatIndex, state, biddingState);
        } else if (state.phase === 'PLAYING') {
            return decideCardPlay(seatIndex, state);
        }

        return null;
    }

    return {
        evaluateHand,
        decideBid,
        decideCardPlay,
        computeBotAction
    };
}));
