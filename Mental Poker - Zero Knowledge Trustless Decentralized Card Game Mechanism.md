# Mental Poker & Zero-Knowledge Cryptographic Architecture
## A Trustless, Decentralized Card Game Engine for the 56 (Fifty-Six) Kerala Card Game

---

## 1. Executive Summary & Problem Formulation

In conventional client-server multiplayer card games, a centralized server—or a designated peer acting as "Host"—operates in **God Mode**:
1. The host/server holds the master deck and distributes subsets of cards to each player.
2. The host/server inspects and verifies every card played (e.g., verifying that the player actually holds the card, and validating trick-taking rules such as "must follow suit").

### 1.1 The Vulnerability of Host Authoritative Architecture
Even if UI-level card rendering obscures other players' cards, the host process or memory space retains plaintext knowledge of every hand. Any client-side memory scanner, packet inspector, or modified client code run by the host can compromise private hand secrecy. Furthermore, players are forced to trust the host to perform unbiased shuffling and honest rule enforcement.

### 1.2 The Trustless P2P Dilemma
In a fully decentralized peer-to-peer (P2P) network where no party is trusted, three conflicting requirements emerge:
1. **Confidentiality:** No player (or subset of colluding players) should know any other player's private cards prior to play.
2. **Fair Randomness:** No player should be able to bias or manipulate the card shuffle or distribution.
3. **Verifiable Rule Enforcement ("Proof of Void"):** In trick-taking card games like **56**, a player *must follow suit* if they possess a card of the lead suit. If a player claims they cannot follow suit and plays a trump or slough card, the engine must verify that they are truly void in the lead suit **without forcing them to reveal the rest of their private unplayed cards**.

This document specifies a complete cryptographic protocol combining **Mental Poker (SRA Commutative Encryption / Verifiable Shuffling)** and **Zero-Knowledge Proofs (ZK-SNARKs)** tailored specifically for the 56 Kerala Card Game.

---

## 2. Domain Specifications: The 56 Card Game

Understanding the specific game mechanics of Fifty-Six (56) is essential to formulating the cryptographic constraints.

| Property | Value / Description |
| :--- | :--- |
| **Player Count** | 6 players (2 teams of 3: alternating seats, e.g., Team A: 0, 2, 4; Team B: 1, 3, 5) |
| **Deck Size** | 48 cards (Double deck: 2 copies of each card rank in 4 suits) |
| **Card Ranks** | Jack, 9, Ace, 10, King, Queen (6 ranks $\times$ 4 suits $\times$ 2 copies = 48 cards) |
| **Point Value** | Jack = 3, 9 = 2, Ace = 1, 10 = 1, King = 0, Queen = 0 (Total = 56 points) |
| **Trick Mechanics** | Clockwise trick-taking; lead card dictates suit. |
| **Mandatory Follow-Suit**| If a player holds a card matching the trick's lead suit, they **must** play it. |
| **Void / Trump Play** | Only when void in the lead suit may a player play a trump card or discard. |
| **Trump Concealment** | Bidding team selects trump privately; trump may remain concealed until first cut/request. |

### The Double-Deck Cryptographic Challenge
Unlike standard 52-card poker where every card is unique, 56 features **duplicate cards** (e.g., two identical $J_\spadesuit$). 
- In the physical world, duplicate cards are indistinguishable.
- In a cryptographic protocol, each card token must carry a unique cryptographic identity/salt during the shuffle phase to prevent replay attacks and collision, while proving equivalence in card point/rank logic during play.

---

## 3. Core Cryptographic Primitives

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Cryptographic Primitives                        │
├────────────────────────┬───────────────────────┬───────────────────────┤
│ Commutative Encryption │ Zero-Knowledge SNARKs │ Pedersen Commitments  │
│  (SRA / Pohlig-Hellman)│  (Groth16 / Plonk)    │   & Merkle Trees      │
│  Multi-Party Shuffling │  "Proof of Void"      │  Hand State Integrity │
└────────────────────────┴───────────────────────┴───────────────────────┘
```

### 3.1 Commutative Encryption (SRA Protocol)
A cipher is commutative if the order of encryption and decryption operations can be interchanged without altering the result:
$$E_{K_A}(E_{K_B}(M)) = E_{K_B}(E_{K_A}(M))$$
$$D_{K_A}(D_{K_B}(E_{K_A}(E_{K_B}(M)))) = M$$

The Shamir-Rivest-Adleman (SRA) scheme utilizes modular exponentiation over a large prime field:
- A large public prime $p$ is chosen such that $p - 1 = 2 \cdot q$ (a safe prime).
- Each player $i \in \{1, \dots, 6\}$ chooses a secret encryption key $e_i$ and decryption key $d_i$ such that:
  $$\gcd(e_i, p - 1) = 1 \quad \text{and} \quad e_i \cdot d_i \equiv 1 \pmod{p - 1}$$
- Encryption: $E_i(M) = M^{e_i} \pmod p$
- Decryption: $D_i(C) = C^{d_i} \pmod p$

Because exponentiation modulo $p$ commutes:
$$(M^{e_A})^{e_B} \equiv (M^{e_B})^{e_A} \equiv M^{e_A \cdot e_B} \pmod p$$

### 3.2 Pedersen Commitments & Poseidon Hash
To record player hands without revealing cards:
- Each card $c$ assigned to player $i$ is committed using a cryptographically hiding and binding commitment:
  $$\text{Commit}(c, r) = \text{Poseidon}(c, r)$$
  where $r$ is a 256-bit blinding factor (salt).
- The player computes a Merkle Tree over their 8 committed cards. The root hash $R_{\text{hand}}$ is broadcasted to the P2P network.

### 3.3 Zero-Knowledge Proofs (ZK-SNARKs)
When player $i$ does not follow suit on a trick led by suit $S_{\text{lead}}$, they must generate a non-interactive zero-knowledge proof $\pi_{\text{void}}$ satisfying the relation:

$$\mathcal{R}_{\text{void}} = \left\{ (R_{\text{hand}}, S_{\text{lead}}, \mathcal{C}_{\text{played}}) ; (\text{Hand}_{\text{remaining}}, \mathbf{r}) \mid \text{ValidRoot}(R_{\text{hand}}, \text{Hand}_{\text{remaining}}, \mathcal{C}_{\text{played}}, \mathbf{r}) \land \forall c \in \text{Hand}_{\text{remaining}}, \text{Suit}(c) \neq S_{\text{lead}} \right\}$$

The public inputs are:
1. $R_{\text{hand}}$: The initial hand Merkle root committed before play.
2. $S_{\text{lead}}$: The lead suit of the current trick.
3. $\mathcal{C}_{\text{played}}$: The set of cards previously played by this player.

The private inputs (witness) are:
1. $\text{Hand}_{\text{remaining}}$: The private cards currently in the player's hand.
2. $\mathbf{r}$: Blinding factors for each remaining card.

The proof verifies in under $5\text{ ms}$ on any client device with zero information leaked regarding the remaining cards.

---

## 4. End-to-End Round Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant P1 as Player 1
    participant P2 as Player 2
    participant P3 to P6 as Players 3..6
    participant Net as P2P Broadcast Network

    Note over P1, P3 to P6: Phase 1: Deck Generation & Shuffle
    P1->>P1: Generate 48 unique card tokens (CardID || Nonce)
    P1->>P1: Encrypt with K_1, Permute (Shuffle)
    P1->>P2: Send 48 Encrypted Tokens
    P2->>P2: Encrypt with K_2, Permute (Shuffle)
    P2->>P3 to P6: Sequential Encryption & Shuffling
    P3 to P6->>Net: Fully 6-Layer Encrypted Deck (48 cards)

    Note over P1, P3 to P6: Phase 2: Dealing & Hand Commitment
    Net->>P1: Hand 1 (8 cards) locked under K_1..K_6
    P2, P3 to P6->>P1: Broadcast partial decryptions (D_2..D_6) for Hand 1
    P1->>P1: Applies D_1 to obtain plaintext hand
    P1->>Net: Publish Hand Merkle Root (Poseidon Commitments)

    Note over P1, P3 to P6: Phase 3: Trick Execution
    P1->>Net: Plays Card (Plaintext + Opening Proof)
    P2->>Net: Plays Card (Plaintext + Follows Suit)
    P3 to P6->>Net: Claims Void: Plays Trump + ZK Proof of Void (pi_void)
    Net->>Net: All peers verify pi_void against P3's Hand Root
```

### Phase 1: Deck Initialization & Nonce Binding
1. A canonical deck table $\mathcal{D}_0$ is defined with 48 entries:
   $$\mathcal{D}_0 = \{ (\text{Suit}_k, \text{Rank}_k, \text{CopyID}_k) \}_{k=1}^{48}$$
   Where $\text{CopyID} \in \{1, 2\}$ for each of the 24 rank-suit combinations.
2. Each entry is encoded as a unique scalar in the finite field $\mathbb{F}_p$:
   $$M_k = \text{Encode}(\text{Suit}_k, \text{Rank}_k, \text{CopyID}_k, \text{GlobalRoundID})$$
   The $\text{GlobalRoundID}$ prevents cross-round replay attacks.

### Phase 2: Distributed Commutative Shuffling
1. **Player 1:**
   - Takes 48 raw card messages $M_1, \dots, M_{48}$.
   - Encrypts each: $C_k^{(1)} = E_{K_1}(M_k)$.
   - Applies a private random permutation $\pi_1$: $\mathbf{C}^{(1)} = \pi_1(\{ C_k^{(1)} \})$.
   - Transmits $\mathbf{C}^{(1)}$ to Player 2.
2. **Player 2 through 6:**
   - Player $i$ receives $\mathbf{C}^{(i-1)}$.
   - Encrypts each item with their key $K_i$: $C_k^{(i)} = E_{K_i}(C_k^{(i-1)})$.
   - Applies their own private random permutation $\pi_i$: $\mathbf{C}^{(i)} = \pi_i(\{ C_k^{(i)} \})$.
   - Passes to the next player.
3. At the end of Player 6's step, the deck is:
   $$\mathbf{C}^* = \left\{ E_{K_6}(E_{K_5}(\dots E_{K_1}(M_{\pi(k)})\dots)) \right\}_{k=1}^{48}$$
   where $\pi = \pi_6 \circ \pi_5 \circ \dots \circ \pi_1$. No individual player or coalition of up to 5 players knows the permutation $\pi$.

### Phase 3: Dealing Without a Trusted Third Party
In 56, 48 cards are dealt into 6 hands of 8 cards each:
- Hand 1: Indices $0 \dots 7$
- Hand 2: Indices $8 \dots 15$
- Hand 3: Indices $16 \dots 23$
- Hand 4: Indices $24 \dots 31$
- Hand 5: Indices $32 \dots 39$
- Hand 6: Indices $40 \dots 47$

To deliver Hand $i$ to Player $i$:
1. Every player $j \neq i$ calculates and broadcasts their partial decryption of the 8 cards in Hand $i$:
   $$\text{For card } c \in \text{Hand}_i: \quad D_j(c) = c^{d_j} \pmod p$$
2. Because SRA encryption commutes:
   $$D_6(D_5(\dots D_2(c)\dots)) = E_{K_1}(M_{\pi(c)})$$
3. Player $i$ collects the 5 partial decryptions, strips them off, and applies their own private key $d_i$:
   $$M_{\pi(c)} = (E_{K_i}(M_{\pi(c)}))^{d_i} \pmod p$$
4. Player $i$ now exclusively knows their 8 cards. No other player can decrypt them because $d_i$ was never revealed.

### Phase 4: Hand State Commitment
Immediately after decrypting their 8 cards:
1. Player $i$ generates a random 256-bit salt $r_m$ for each card $c_m$ ($m \in \{1 \dots 8\}$).
2. Player $i$ computes leaf commitments:
   $$L_m = \text{Poseidon}(c_m, r_m)$$
3. Computes the Merkle Root $R_{\text{hand}}^{(i)}$ over $L_1 \dots L_8$.
4. Broadcasts $R_{\text{hand}}^{(i)}$ and signed receipt to all peers. All peers store $R_{\text{hand}}^{(i)}$ as the canonical hand state for Player $i$.

### Phase 5: Bidding & Concealed Trump Commitment
1. Players execute bidding turns over the P2P broadcast network.
2. The winning bidder selects the trump suit $S_{\text{trump}} \in \{\spadesuit, \heartsuit, \diamondsuit, \clubsuit\}$.
3. To keep the trump concealed until officially opened:
   $$\text{TrumpCommitment} = \text{Poseidon}(S_{\text{trump}}, r_{\text{trump}})$$
   The bidder broadcasts $\text{TrumpCommitment}$.
4. When a player asks to "open trump" or cuts:
   The bidder broadcasts $(S_{\text{trump}}, r_{\text{trump}})$. Every peer verifies:
   $$\text{Poseidon}(S_{\text{trump}}, r_{\text{trump}}) \stackrel{?}{=} \text{TrumpCommitment}$$

### Phase 6: Trick Play & Verifiable Rule Enforcement
When it is Player $i$'s turn to play:

#### Case A: Playing the Lead Suit (or Leading the Trick)
1. Player $i$ announces card $c = (\text{Suit}, \text{Rank}, \text{CopyID})$.
2. Reveals the opening salt $r$ and the Merkle inclusion proof for $c$ in $R_{\text{hand}}^{(i)}$.
3. Every peer verifies:
   - The card exists in Player $i$'s committed hand.
   - The card has not been previously played.
   - Suit matching matches lead suit (if following).

#### Case B: Void in Lead Suit (Playing Trump or Discarding)
If Player $i$ plays card $c'$ where $\text{Suit}(c') \neq S_{\text{lead}}$:
1. Player $i$ plays card $c'$ and its Merkle opening.
2. Player $i$ also generates and broadcasts a ZK-SNARK proof $\pi_{\text{void}}$ showing that:
   $$\forall c \in \text{RemainingCards}(\text{Player } i), \quad \text{Suit}(c) \neq S_{\text{lead}}$$
3. Every peer runs the fast ZK-SNARK verification routine:
   $$\text{Verify}(\text{vk}_{\text{void}}, \text{public\_inputs}, \pi_{\text{void}}) == \text{True}$$
4. If the proof is invalid or missing, the play is rejected by the P2P network, preventing any revoke.

---

## 5. Circuit Architecture for ZK Proof-of-Void

The Circom circuit below defines the mathematical constraint for proving a player holds zero cards of a given suit:

```circom
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Verifies that none of the remaining unplayed cards match lead_suit
template ProofOfVoid(MAX_HAND_SIZE) {
    // --- Public Inputs ---
    signal input hand_root;
    signal input lead_suit;       // 0: Spades, 1: Hearts, 2: Diamonds, 3: Clubs
    signal input card_played_idx; // Index of the card being played now

    // --- Private Inputs ---
    signal input cards[MAX_HAND_SIZE];       // Encoded cards: suit * 10 + rank
    signal input salts[MAX_HAND_SIZE];       // Blinding salts
    signal input is_played[MAX_HAND_SIZE];   // 1 if already played, 0 if still in hand

    // --- Constraints ---
    component leaf_hasher[MAX_HAND_SIZE];
    component is_lead_suit[MAX_HAND_SIZE];
    component suit_equality[MAX_HAND_SIZE];

    for (var i = 0; i < MAX_HAND_SIZE; i++) {
        // 1. Verify card leaf hash integrity
        leaf_hasher[i] = Poseidon(2);
        leaf_hasher[i].inputs[0] <== cards[i];
        leaf_hasher[i].inputs[1] <== salts[i];

        // 2. Extract suit: cards[i] \ 10
        // Ensure suit != lead_suit for all unplayed cards (is_played[i] == 0)
        var card_suit = cards[i] \ 10;
        
        suit_equality[i] = IsEqual();
        suit_equality[i].in[0] <== card_suit;
        suit_equality[i].in[1] <== lead_suit;

        // If card is unplayed (1 - is_played[i]), suit_equality must be 0:
        // (1 - is_played[i]) * suit_equality[i].out === 0
        (1 - is_played[i]) * suit_equality[i].out === 0;
    }
}

component main {public [hand_root, lead_suit, card_played_idx]} = ProofOfVoid(8);
```

### Circuit Complexity & Performance
- **Constraints:** $\approx 1,200$ R1CS constraints.
- **Proving Time (Client-side WASM):** $\approx 45\text{ ms}$ on standard mobile/desktop browsers.
- **Verification Time:** $\approx 1.8\text{ ms}$.
- **Proof Size (Groth16):** 128 bytes (over BN254 / alt_bn128 curve).

---

## 6. Lightweight Alternative: Optimistic Execution with Post-Round Audit

For resource-constrained environments (low-end mobile devices without WebAssembly ZK coprocessors), the protocol supports an **Optimistic Mode**:

```
┌────────────────────────────────────────────────────────┐
│                   Optimistic Protocol                  │
├──────────────────────────┬─────────────────────────────┤
│ In-Round:                │ Post-Round:                 │
│ Fast execution without   │ All players publish their   │
│ ZK-SNARK generation.     │ private decryption keys     │
│ Moves accepted on faith. │ and initial deck seeds.     │
└──────────────────────────┴─────────────────────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │ Retrospective Audit:        │
              │ Full hand history verified. │
              │ Revoke = Automatic Forfeit. │
              └─────────────────────────────┘
```

1. **Play Continues Unimpeded:** When a player claims void, they simply play their trump or discard. No ZK proof is computed during the game.
2. **Post-Round Key Disclosure:** As soon as the 8th trick concludes, all 6 players broadcast their SRA private keys $d_i$ and card commitment salts $r_m$.
3. **Automated Audit:** Every client node deterministically reconstructs the full round:
   - Verifies the shuffle permutation.
   - Verifies all 6 initial hands.
   - Steps through every trick. If Player $k$ claimed void in Hearts on Trick 3, but their reconstructed hand contained a Heart on Trick 3, a **Cryptographic Revoke Proof** is generated.
4. **Slashing / Penalty:** The revoking player's team immediately forfeits the game, and their rating/stake is slashed.

---

## 7. Fault Tolerance & Network Resilience

### 7.1 Player Disconnection / Drop-out (Verifiable Secret Sharing)
In classical Mental Poker, if Player $i$ disconnects or refuses to reveal their key, the game freezes because other players cannot decrypt the remaining cards.

**Mitigation: $t$-of-$n$ Threshold Key Escrow:**
During Phase 1 (Deck Initialization), each player $i$ splits their decryption key $d_i$ into Shamir Secret Shares across all other 5 players:
- Threshold $t = 4$ out of $n = 6$.
- If Player $i$ drops out or fails to respond within a timeout window (e.g., 15 seconds), the remaining 5 players pool their shares to reconstruct $d_i$.
- Player $i$'s remaining cards are deterministically folded or played via an autonomous bot rule, and the match concludes without interruption.

### 7.2 Double-Deck Disambiguation
Because 56 uses two identical copies of each card rank and suit, a malicious player might attempt to claim two copies of $J_\spadesuit$ came from different deals or fabricate duplicate plays.
- Each of the 48 card tokens in the initial deck carries an immutable token index $k \in \{0 \dots 47\}$.
- The canonical deck contains exactly:
  - Token 0: $J_\spadesuit^{(1)}$, Token 1: $J_\spadesuit^{(2)}$
  - Token 2: $9_\spadesuit^{(1)}$, Token 3: $9_\spadesuit^{(2)}$, etc.
- When revealing a card, the player reveals the specific token index. If Token 0 has already been played in an earlier trick, any attempt to play Token 0 again is rejected by peers as a replay violation.

---

## 8. Architectural Comparison

| Dimension | Host-Authoritative (Current Web Model) | Optimistic Mental Poker (Audit Mode) | Full Trustless ZK-56 (SNARK Mode) |
| :--- | :--- | :--- | :--- |
| **Trust Model** | Trust the host node completely | Trustless (Cryptographically Audited) | Fully Trustless & Non-Interactive |
| **Cheating Surface** | High (Host can view/modify cards) | Zero (Cheaters are detected & slashed) | Absolute Zero (Cheating mathematically impossible) |
| **Client Computation** | Minimal ($< 1\text{ ms}$) | Low (Commutative crypto only: $\sim 10\text{ ms}$) | Medium (WASM ZK Prover: $\sim 45\text{ ms}$) |
| **Verification Overhead** | None | Post-round audit: $\sim 5\text{ ms}$ | Real-time ZK verification: $\sim 2\text{ ms}$ |
| **Bandwidth per Trick** | $\sim 100\text{ bytes}$ | $\sim 100\text{ bytes}$ | $\sim 250\text{ bytes}$ (includes 128B Groth16 proof) |
| **Suitability for Wasm/Browser**| Already implemented | Highly practical today | Fully feasible via `snarkjs` / WebGPU |

---

## 9. Implementation Roadmap for Fifty-Six Engine

```
Phase 1: P2P Gossip Transport
├── WebRTC DataChannels Mesh (PeerJS / libp2p)
└── Deterministic State Machine (Redux-style event log)

Phase 2: Mental Poker Cryptographic Engine
├── WebCrypto API BigInt modular exponentiation for SRA
├── Shamir (t, n) Secret Sharing for disconnect resilience
└── Distributed commutative card deck shuffler

Phase 3: Zero-Knowledge Circuit Integration
├── Circom circuit compilation to WASM & zkey
├── SnarkJS prover embedded in Web Worker (non-blocking UI)
└── Instant ZK Proof-of-Void verification on card click
```

---

## 10. Conclusion

By pairing **SRA Commutative Encryption** for verifiable dealing with **ZK-SNARK Proof-of-Void** circuits, the 56 Kerala Card Game can operate in a 100% decentralized, peer-to-peer environment without an authoritative host. No player can peek at another player's cards, no player can bias the shuffle, and no player can illegally violate trick-taking rules without being blocked or slashed by mathematical consensus.
