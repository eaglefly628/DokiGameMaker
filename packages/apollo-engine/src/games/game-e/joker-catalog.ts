import { jokerArtKey } from './assets.js';
import type { JokerType, Rarity } from './jokers.js';

// ════════════════════════════════════════════════════════════════════════
//  Game E · 完整小丑数据库（全 150 张官方小丑，截至 1.0.1o）
//  纯数据目录：每张的稳定元数据（稀有度/价格/7型/激活时机/效果文案/是否有图）。
//  可执行的声明式效果（{op,target,value,when}）见 jokers.ts 的 STARTER_JOKERS（已覆盖子集）；
//  本目录是「数据库要全」的全量真相，逐张可由弱 LLM 产出/校对。
//  源：Balatro Wiki · Jokers。美术命中 109/150（其余素材包暂缺，渲染走占位）。
// ════════════════════════════════════════════════════════════════════════

/** 激活时机（决定 effect 监听哪个信号；passive=被动改规则/元，N/A）。 */
export type Activation =
  | 'indep'
  | 'on_scored'
  | 'on_held'
  | 'on_played'
  | 'on_discard'
  | 'mixed'
  | 'on_other_jokers'
  | 'passive';

export interface JokerCatalogEntry {
  readonly nr: number;
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** 商店价格；Legendary（Soul 获取）为 null。 */
  readonly cost: number | null;
  readonly jokerType: JokerType;
  readonly activation: Activation;
  /** 该 id 在资产包里是否有美术（否则渲染走占位）。 */
  readonly hasArt: boolean;
  readonly text: string;
}

/** 全 150 张官方小丑（nr 升序 = 官方图鉴序）。 */
export const JOKER_CATALOG: readonly JokerCatalogEntry[] = [
  { nr: 1, id: "joker", name: "Joker", rarity: "common", cost: 2, jokerType: "+m", activation: "indep", hasArt: true, text: "+4 Mult" },
  { nr: 2, id: "greedy_joker", name: "Greedy Joker", rarity: "common", cost: 5, jokerType: "+m", activation: "on_scored", hasArt: true, text: "Played cards with Diamond suit give +3 Mult when scored" },
  { nr: 3, id: "lusty_joker", name: "Lusty Joker", rarity: "common", cost: 5, jokerType: "+m", activation: "on_scored", hasArt: true, text: "Played cards with Heart suit give +3 Mult when scored" },
  { nr: 4, id: "wrathful_joker", name: "Wrathful Joker", rarity: "common", cost: 5, jokerType: "+m", activation: "on_scored", hasArt: true, text: "Played cards with Spade suit give +3 Mult when scored" },
  { nr: 5, id: "gluttonous_joker", name: "Gluttonous Joker", rarity: "common", cost: 5, jokerType: "+m", activation: "on_scored", hasArt: true, text: "Played cards with Club suit give +3 Mult when scored" },
  { nr: 6, id: "jolly_joker", name: "Jolly Joker", rarity: "common", cost: 3, jokerType: "+m", activation: "indep", hasArt: true, text: "+8 Mult if played hand contains a Pair" },
  { nr: 7, id: "zany_joker", name: "Zany Joker", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: true, text: "+12 Mult if played hand contains a Three of a Kind" },
  { nr: 8, id: "mad_joker", name: "Mad Joker", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: true, text: "+10 Mult if played hand contains a Two Pair" },
  { nr: 9, id: "crazy_joker", name: "Crazy Joker", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: true, text: "+12 Mult if played hand contains a Straight" },
  { nr: 10, id: "droll_joker", name: "Droll Joker", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: true, text: "+10 Mult if played hand contains a Flush" },
  { nr: 11, id: "sly_joker", name: "Sly Joker", rarity: "common", cost: 3, jokerType: "+c", activation: "indep", hasArt: true, text: "+50 Chips if played hand contains a Pair" },
  { nr: 12, id: "wily_joker", name: "Wily Joker", rarity: "common", cost: 4, jokerType: "+c", activation: "indep", hasArt: true, text: "+100 Chips if played hand contains a Three of a Kind" },
  { nr: 13, id: "clever_joker", name: "Clever Joker", rarity: "common", cost: 4, jokerType: "+c", activation: "indep", hasArt: true, text: "+80 Chips if played hand contains a Two Pair" },
  { nr: 14, id: "devious_joker", name: "Devious Joker", rarity: "common", cost: 4, jokerType: "+c", activation: "indep", hasArt: true, text: "+100 Chips if played hand contains a Straight" },
  { nr: 15, id: "crafty_joker", name: "Crafty Joker", rarity: "common", cost: 4, jokerType: "+c", activation: "indep", hasArt: true, text: "+80 Chips if played hand contains a Flush" },
  { nr: 16, id: "half_joker", name: "Half Joker", rarity: "common", cost: 5, jokerType: "+m", activation: "indep", hasArt: true, text: "+20 Mult if played hand contains 3 or fewer cards" },
  { nr: 17, id: "joker_stencil", name: "Joker Stencil", rarity: "uncommon", cost: 8, jokerType: "Xm", activation: "indep", hasArt: false, text: "X1 Mult for each empty Joker slot" },
  { nr: 18, id: "four_fingers", name: "Four Fingers", rarity: "uncommon", cost: 7, jokerType: "!!", activation: "passive", hasArt: false, text: "All Flushes and Straights can be made with 4 cards" },
  { nr: 19, id: "mime", name: "Mime", rarity: "uncommon", cost: 5, jokerType: "...", activation: "on_held", hasArt: false, text: "Retrigger all card held in hand abilities" },
  { nr: 20, id: "credit_card", name: "Credit Card", rarity: "common", cost: 1, jokerType: "+$", activation: "passive", hasArt: false, text: "Go up to -$20 in debt" },
  { nr: 21, id: "ceremonial_dagger", name: "Ceremonial Dagger", rarity: "uncommon", cost: 6, jokerType: "+m", activation: "indep", hasArt: false, text: "When Blind is selected, destroy Joker to the right and permanently add double its sell value to this Mult" },
  { nr: 22, id: "banner", name: "Banner", rarity: "common", cost: 5, jokerType: "+c", activation: "indep", hasArt: false, text: "+30 Chips for each remaining discard" },
  { nr: 23, id: "mystic_summit", name: "Mystic Summit", rarity: "common", cost: 5, jokerType: "+m", activation: "indep", hasArt: false, text: "+15 Mult when 0 discards remaining" },
  { nr: 24, id: "marble_joker", name: "Marble Joker", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: false, text: "Adds one Stone card to the deck when Blind is selected" },
  { nr: 25, id: "loyalty_card", name: "Loyalty Card", rarity: "uncommon", cost: 5, jokerType: "Xm", activation: "indep", hasArt: false, text: "X4 Mult every 6 hands played" },
  { nr: 26, id: "8_ball", name: "8 Ball", rarity: "common", cost: 5, jokerType: "!!", activation: "on_scored", hasArt: false, text: "1 in 4 chance for each played 8 to create a Tarot card when scored" },
  { nr: 27, id: "misprint", name: "Misprint", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: false, text: "+0-23 Mult" },
  { nr: 28, id: "dusk", name: "Dusk", rarity: "uncommon", cost: 5, jokerType: "...", activation: "on_scored", hasArt: false, text: "Retrigger all played cards in final hand of the round" },
  { nr: 29, id: "raised_fist", name: "Raised Fist", rarity: "common", cost: 5, jokerType: "+m", activation: "on_held", hasArt: false, text: "Adds double the rank of lowest ranked card held in hand to Mult" },
  { nr: 30, id: "chaos_the_clown", name: "Chaos the Clown", rarity: "common", cost: 4, jokerType: "!!", activation: "passive", hasArt: false, text: "1 free Reroll per shop" },
  { nr: 31, id: "fibonacci", name: "Fibonacci", rarity: "uncommon", cost: 8, jokerType: "+m", activation: "on_scored", hasArt: false, text: "Each played Ace, 2, 3, 5, or 8 gives +8 Mult when scored" },
  { nr: 32, id: "steel_joker", name: "Steel Joker", rarity: "uncommon", cost: 7, jokerType: "Xm", activation: "indep", hasArt: false, text: "Gives X0.2 Mult for each Steel Card in your full deck" },
  { nr: 33, id: "scary_face", name: "Scary Face", rarity: "common", cost: 4, jokerType: "+c", activation: "on_scored", hasArt: false, text: "Played face cards give +30 Chips when scored" },
  { nr: 34, id: "abstract_joker", name: "Abstract Joker", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: false, text: "+3 Mult for each Joker card" },
  { nr: 35, id: "delayed_gratification", name: "Delayed Gratification", rarity: "common", cost: 4, jokerType: "+$", activation: "passive", hasArt: false, text: "Earn $2 per discard if no discards are used by end of the round" },
  { nr: 36, id: "hack", name: "Hack", rarity: "uncommon", cost: 6, jokerType: "...", activation: "on_scored", hasArt: false, text: "Retrigger each played 2, 3, 4, or 5" },
  { nr: 37, id: "pareidolia", name: "Pareidolia", rarity: "uncommon", cost: 5, jokerType: "!!", activation: "passive", hasArt: false, text: "All cards are considered face cards" },
  { nr: 38, id: "gros_michel", name: "Gros Michel", rarity: "common", cost: 5, jokerType: "+m", activation: "indep", hasArt: true, text: "+15 Mult. 1 in 6 chance this card is destroyed at the end of round" },
  { nr: 39, id: "even_steven", name: "Even Steven", rarity: "common", cost: 4, jokerType: "+m", activation: "on_scored", hasArt: false, text: "Played cards with even rank give +4 Mult when scored" },
  { nr: 40, id: "odd_todd", name: "Odd Todd", rarity: "common", cost: 4, jokerType: "+c", activation: "on_scored", hasArt: false, text: "Played cards with odd rank give +31 Chips when scored" },
  { nr: 41, id: "scholar", name: "Scholar", rarity: "common", cost: 4, jokerType: "++", activation: "on_scored", hasArt: true, text: "Played Aces give +20 Chips and +4 Mult when scored" },
  { nr: 42, id: "business_card", name: "Business Card", rarity: "common", cost: 4, jokerType: "+$", activation: "on_scored", hasArt: true, text: "Played face cards have a 1 in 2 chance to give $2 when scored" },
  { nr: 43, id: "supernova", name: "Supernova", rarity: "common", cost: 5, jokerType: "+m", activation: "indep", hasArt: true, text: "Adds the number of times poker hand has been played this run to Mult" },
  { nr: 44, id: "ride_the_bus", name: "Ride the Bus", rarity: "common", cost: 6, jokerType: "+m", activation: "mixed", hasArt: true, text: "This Joker gains +1 Mult per consecutive hand played without a scoring face card" },
  { nr: 45, id: "space_joker", name: "Space Joker", rarity: "uncommon", cost: 5, jokerType: "!!", activation: "on_played", hasArt: true, text: "1 in 4 chance to upgrade level of played poker hand" },
  { nr: 46, id: "egg", name: "Egg", rarity: "common", cost: 4, jokerType: "+$", activation: "passive", hasArt: true, text: "Gains $3 of sell value at end of round" },
  { nr: 47, id: "burglar", name: "Burglar", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "When Blind is selected, gain +3 Hands and lose all discards" },
  { nr: 48, id: "blackboard", name: "Blackboard", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult if all cards held in hand are Spades or Clubs" },
  { nr: 49, id: "runner", name: "Runner", rarity: "common", cost: 5, jokerType: "+c", activation: "mixed", hasArt: true, text: "Gains +15 Chips if played hand contains a Straight" },
  { nr: 50, id: "ice_cream", name: "Ice Cream", rarity: "common", cost: 5, jokerType: "+c", activation: "indep", hasArt: true, text: "+100 Chips, -5 Chips for every hand played" },
  { nr: 51, id: "dna", name: "DNA", rarity: "rare", cost: 8, jokerType: "!!", activation: "on_played", hasArt: true, text: "If first hand of round has only 1 card, add a permanent copy to deck and draw it to hand" },
  { nr: 52, id: "splash", name: "Splash", rarity: "common", cost: 3, jokerType: "!!", activation: "passive", hasArt: true, text: "Every played card counts in scoring" },
  { nr: 53, id: "blue_joker", name: "Blue Joker", rarity: "common", cost: 5, jokerType: "+c", activation: "indep", hasArt: true, text: "+2 Chips for each remaining card in deck" },
  { nr: 54, id: "sixth_sense", name: "Sixth Sense", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "If first hand of round is a single 6, destroy it and create a Spectral card" },
  { nr: 55, id: "constellation", name: "Constellation", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: true, text: "This Joker gains X0.1 Mult every time a Planet card is used" },
  { nr: 56, id: "hiker", name: "Hiker", rarity: "uncommon", cost: 5, jokerType: "+c", activation: "on_scored", hasArt: true, text: "Every played card permanently gains +5 Chips when scored" },
  { nr: 57, id: "faceless_joker", name: "Faceless Joker", rarity: "common", cost: 4, jokerType: "+$", activation: "on_discard", hasArt: true, text: "Earn $5 if 3 or more face cards are discarded at the same time" },
  { nr: 58, id: "green_joker", name: "Green Joker", rarity: "common", cost: 4, jokerType: "+m", activation: "mixed", hasArt: true, text: "+1 Mult per hand played, -1 Mult per discard" },
  { nr: 59, id: "superposition", name: "Superposition", rarity: "common", cost: 4, jokerType: "!!", activation: "indep", hasArt: true, text: "Create a Tarot card if poker hand contains an Ace and a Straight" },
  { nr: 60, id: "to_do_list", name: "To Do List", rarity: "common", cost: 4, jokerType: "+$", activation: "on_played", hasArt: true, text: "Earn $4 if poker hand is a specified hand, changes at end of round" },
  { nr: 61, id: "cavendish", name: "Cavendish", rarity: "common", cost: 4, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult. 1 in 1000 chance this card is destroyed at the end of round" },
  { nr: 62, id: "card_sharp", name: "Card Sharp", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult if played poker hand has already been played this round" },
  { nr: 63, id: "red_card", name: "Red Card", rarity: "common", cost: 5, jokerType: "+m", activation: "indep", hasArt: true, text: "This Joker gains +3 Mult when any Booster Pack is skipped" },
  { nr: 64, id: "madness", name: "Madness", rarity: "uncommon", cost: 7, jokerType: "Xm", activation: "indep", hasArt: true, text: "When Small Blind or Big Blind is selected, gain X0.5 Mult and destroy a random Joker" },
  { nr: 65, id: "square_joker", name: "Square Joker", rarity: "common", cost: 4, jokerType: "+c", activation: "mixed", hasArt: true, text: "This Joker gains +4 Chips if played hand has exactly 4 cards" },
  { nr: 66, id: "s_ance", name: "Séance", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "indep", hasArt: true, text: "If poker hand is a Straight Flush, create a random Spectral card" },
  { nr: 67, id: "riff_raff", name: "Riff-Raff", rarity: "common", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "When Blind is selected, create 2 Common Jokers" },
  { nr: 68, id: "vampire", name: "Vampire", rarity: "uncommon", cost: 7, jokerType: "Xm", activation: "mixed", hasArt: true, text: "This Joker gains X0.1 Mult per scoring Enhanced card played, removes card Enhancement" },
  { nr: 69, id: "shortcut", name: "Shortcut", rarity: "uncommon", cost: 7, jokerType: "!!", activation: "passive", hasArt: true, text: "Allows Straights to be made with gaps of 1 rank" },
  { nr: 70, id: "hologram", name: "Hologram", rarity: "uncommon", cost: 7, jokerType: "Xm", activation: "indep", hasArt: true, text: "This Joker gains X0.25 Mult every time a playing card is added to your deck" },
  { nr: 71, id: "vagabond", name: "Vagabond", rarity: "rare", cost: 8, jokerType: "!!", activation: "indep", hasArt: true, text: "Create a Tarot card if hand is played with $4 or less" },
  { nr: 72, id: "baron", name: "Baron", rarity: "rare", cost: 8, jokerType: "Xm", activation: "on_held", hasArt: true, text: "Each King held in hand gives X1.5 Mult" },
  { nr: 73, id: "cloud_9", name: "Cloud 9", rarity: "uncommon", cost: 7, jokerType: "+$", activation: "passive", hasArt: true, text: "Earn $1 for each 9 in your full deck at end of round" },
  { nr: 74, id: "rocket", name: "Rocket", rarity: "uncommon", cost: 6, jokerType: "+$", activation: "passive", hasArt: true, text: "Earn $1 at end of round. Payout increases by $2 when Boss Blind is defeated" },
  { nr: 75, id: "obelisk", name: "Obelisk", rarity: "rare", cost: 8, jokerType: "Xm", activation: "mixed", hasArt: true, text: "This Joker gains X0.2 Mult per consecutive hand played without playing your most played poker hand" },
  { nr: 76, id: "midas_mask", name: "Midas Mask", rarity: "uncommon", cost: 7, jokerType: "!!", activation: "on_played", hasArt: true, text: "All played face cards become Gold cards when scored" },
  { nr: 77, id: "luchador", name: "Luchador", rarity: "uncommon", cost: 5, jokerType: "!!", activation: "passive", hasArt: true, text: "Sell this card to disable the current Boss Blind" },
  { nr: 78, id: "photograph", name: "Photograph", rarity: "common", cost: 5, jokerType: "Xm", activation: "on_scored", hasArt: true, text: "First played face card gives X2 Mult when scored" },
  { nr: 79, id: "gift_card", name: "Gift Card", rarity: "uncommon", cost: 6, jokerType: "+$", activation: "passive", hasArt: true, text: "Add $1 of sell value to every Joker and Consumable card at end of round" },
  { nr: 80, id: "turtle_bean", name: "Turtle Bean", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "+5 hand size, reduces by 1 each round" },
  { nr: 81, id: "erosion", name: "Erosion", rarity: "uncommon", cost: 6, jokerType: "+m", activation: "indep", hasArt: true, text: "+4 Mult for each card below the deck's starting size in your full deck" },
  { nr: 82, id: "reserved_parking", name: "Reserved Parking", rarity: "common", cost: 6, jokerType: "+$", activation: "on_held", hasArt: true, text: "Each face card held in hand has a 1 in 2 chance to give $1" },
  { nr: 83, id: "mail_in_rebate", name: "Mail-In Rebate", rarity: "common", cost: 4, jokerType: "+$", activation: "on_discard", hasArt: true, text: "Earn $5 for each discarded card of a specified rank, rank changes every round" },
  { nr: 84, id: "to_the_moon", name: "To the Moon", rarity: "uncommon", cost: 5, jokerType: "+$", activation: "passive", hasArt: true, text: "Earn an extra $1 of interest for every $5 you have at end of round" },
  { nr: 85, id: "hallucination", name: "Hallucination", rarity: "common", cost: 4, jokerType: "!!", activation: "passive", hasArt: true, text: "1 in 2 chance to create a Tarot card when any Booster Pack is opened" },
  { nr: 86, id: "fortune_teller", name: "Fortune Teller", rarity: "common", cost: 6, jokerType: "+m", activation: "indep", hasArt: true, text: "+1 Mult per Tarot card used this run" },
  { nr: 87, id: "juggler", name: "Juggler", rarity: "common", cost: 4, jokerType: "!!", activation: "passive", hasArt: true, text: "+1 hand size" },
  { nr: 88, id: "drunkard", name: "Drunkard", rarity: "common", cost: 4, jokerType: "!!", activation: "passive", hasArt: true, text: "+1 discard each round" },
  { nr: 89, id: "stone_joker", name: "Stone Joker", rarity: "uncommon", cost: 6, jokerType: "+c", activation: "indep", hasArt: true, text: "Gives +25 Chips for each Stone Card in your full deck" },
  { nr: 90, id: "golden_joker", name: "Golden Joker", rarity: "common", cost: 6, jokerType: "+$", activation: "passive", hasArt: true, text: "Earn $4 at end of round" },
  { nr: 91, id: "lucky_cat", name: "Lucky Cat", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "mixed", hasArt: false, text: "This Joker gains X0.25 Mult every time a Lucky card successfully triggers" },
  { nr: 92, id: "baseball_card", name: "Baseball Card", rarity: "rare", cost: 8, jokerType: "Xm", activation: "on_other_jokers", hasArt: false, text: "Uncommon Jokers each give X1.5 Mult" },
  { nr: 93, id: "bull", name: "Bull", rarity: "uncommon", cost: 6, jokerType: "+c", activation: "indep", hasArt: false, text: "+2 Chips for each $1 you have" },
  { nr: 94, id: "diet_cola", name: "Diet Cola", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: false, text: "Sell this card to create a free Double Tag" },
  { nr: 95, id: "trading_card", name: "Trading Card", rarity: "uncommon", cost: 6, jokerType: "+$", activation: "on_discard", hasArt: false, text: "If first discard of round has only 1 card, destroy it and earn $3" },
  { nr: 96, id: "flash_card", name: "Flash Card", rarity: "uncommon", cost: 5, jokerType: "+m", activation: "indep", hasArt: false, text: "This Joker gains +2 Mult per reroll in the shop" },
  { nr: 97, id: "popcorn", name: "Popcorn", rarity: "common", cost: 5, jokerType: "+m", activation: "indep", hasArt: false, text: "+20 Mult, -4 Mult per round played" },
  { nr: 98, id: "spare_trousers", name: "Spare Trousers", rarity: "uncommon", cost: 6, jokerType: "+m", activation: "mixed", hasArt: false, text: "This Joker gains +2 Mult if played hand contains a Two Pair" },
  { nr: 99, id: "ancient_joker", name: "Ancient Joker", rarity: "rare", cost: 8, jokerType: "Xm", activation: "on_scored", hasArt: false, text: "Each played card with a specified suit gives X1.5 Mult when scored, suit changes at end of round" },
  { nr: 100, id: "ramen", name: "Ramen", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "mixed", hasArt: false, text: "X2 Mult, loses X0.01 Mult per card discarded" },
  { nr: 101, id: "walkie_talkie", name: "Walkie Talkie", rarity: "common", cost: 4, jokerType: "++", activation: "on_scored", hasArt: true, text: "Each played 10 or 4 gives +10 Chips and +4 Mult when scored" },
  { nr: 102, id: "seltzer", name: "Seltzer", rarity: "uncommon", cost: 6, jokerType: "...", activation: "on_scored", hasArt: true, text: "Retrigger all cards played for the next 10 hands" },
  { nr: 103, id: "castle", name: "Castle", rarity: "uncommon", cost: 6, jokerType: "+c", activation: "mixed", hasArt: true, text: "This Joker gains +3 Chips per discarded card of a specified suit, suit changes every round" },
  { nr: 104, id: "smiley_face", name: "Smiley Face", rarity: "common", cost: 4, jokerType: "+m", activation: "on_scored", hasArt: true, text: "Played face cards give +5 Mult when scored" },
  { nr: 105, id: "campfire", name: "Campfire", rarity: "rare", cost: 9, jokerType: "Xm", activation: "indep", hasArt: true, text: "This Joker gains X0.25 Mult for each card sold, resets when Boss Blind is defeated" },
  { nr: 106, id: "golden_ticket", name: "Golden Ticket", rarity: "common", cost: 5, jokerType: "+$", activation: "on_scored", hasArt: true, text: "Played Gold cards earn $4 when scored" },
  { nr: 107, id: "mr_bones", name: "Mr. Bones", rarity: "uncommon", cost: 5, jokerType: "!!", activation: "passive", hasArt: true, text: "Prevents Death if chips scored are at least 25% of required chips, self destructs" },
  { nr: 108, id: "acrobat", name: "Acrobat", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult on final hand of round" },
  { nr: 109, id: "sock_and_buskin", name: "Sock and Buskin", rarity: "uncommon", cost: 6, jokerType: "...", activation: "on_scored", hasArt: true, text: "Retrigger all played face cards" },
  { nr: 110, id: "swashbuckler", name: "Swashbuckler", rarity: "common", cost: 4, jokerType: "+m", activation: "indep", hasArt: true, text: "Adds the sell value of all other owned Jokers to Mult" },
  { nr: 111, id: "troubadour", name: "Troubadour", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "+2 hand size, -1 hand per round" },
  { nr: 112, id: "certificate", name: "Certificate", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "When round begins, add a random playing card with a random seal to your hand" },
  { nr: 113, id: "smeared_joker", name: "Smeared Joker", rarity: "uncommon", cost: 7, jokerType: "!!", activation: "passive", hasArt: true, text: "Hearts and Diamonds count as the same suit, Spades and Clubs count as the same suit" },
  { nr: 114, id: "throwback", name: "Throwback", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: true, text: "X0.25 Mult for each Blind skipped this run" },
  { nr: 115, id: "hanging_chad", name: "Hanging Chad", rarity: "common", cost: 4, jokerType: "...", activation: "on_scored", hasArt: true, text: "Retrigger first played card used in scoring 2 additional times" },
  { nr: 116, id: "rough_gem", name: "Rough Gem", rarity: "uncommon", cost: 7, jokerType: "+$", activation: "on_scored", hasArt: true, text: "Played cards with Diamond suit earn $1 when scored" },
  { nr: 117, id: "bloodstone", name: "Bloodstone", rarity: "uncommon", cost: 7, jokerType: "Xm", activation: "on_scored", hasArt: true, text: "1 in 2 chance for played cards with Heart suit to give X1.5 Mult when scored" },
  { nr: 118, id: "arrowhead", name: "Arrowhead", rarity: "uncommon", cost: 7, jokerType: "+c", activation: "on_scored", hasArt: true, text: "Played cards with Spade suit give +50 Chips when scored" },
  { nr: 119, id: "onyx_agate", name: "Onyx Agate", rarity: "uncommon", cost: 7, jokerType: "+m", activation: "on_scored", hasArt: false, text: "Played cards with Club suit give +7 Mult when scored" },
  { nr: 120, id: "glass_joker", name: "Glass Joker", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: false, text: "This Joker gains X0.75 Mult for every Glass Card that is destroyed" },
  { nr: 121, id: "showman", name: "Showman", rarity: "uncommon", cost: 5, jokerType: "!!", activation: "passive", hasArt: true, text: "Joker, Tarot, Planet, and Spectral cards may appear multiple times" },
  { nr: 122, id: "flower_pot", name: "Flower Pot", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: false, text: "X3 Mult if poker hand contains a Diamond, Club, Heart, and Spade card" },
  { nr: 123, id: "blueprint", name: "Blueprint", rarity: "rare", cost: 10, jokerType: "!!", activation: "passive", hasArt: false, text: "Copies ability of Joker to the right" },
  { nr: 124, id: "wee_joker", name: "Wee Joker", rarity: "rare", cost: 8, jokerType: "+c", activation: "mixed", hasArt: false, text: "This Joker gains +8 Chips when each played 2 is scored" },
  { nr: 125, id: "merry_andy", name: "Merry Andy", rarity: "uncommon", cost: 7, jokerType: "!!", activation: "passive", hasArt: false, text: "+3 discards each round, -1 hand size" },
  { nr: 126, id: "oops_all_6s", name: "Oops! All 6s", rarity: "uncommon", cost: 4, jokerType: "!!", activation: "passive", hasArt: false, text: "Doubles all listed probabilities" },
  { nr: 127, id: "the_idol", name: "The Idol", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "on_scored", hasArt: false, text: "Each played card of a specified rank and suit gives X2 Mult when scored, changes every round" },
  { nr: 128, id: "seeing_double", name: "Seeing Double", rarity: "uncommon", cost: 6, jokerType: "Xm", activation: "indep", hasArt: true, text: "X2 Mult if played hand has a scoring Club card and a scoring card of any other suit" },
  { nr: 129, id: "matador", name: "Matador", rarity: "uncommon", cost: 7, jokerType: "+$", activation: "indep", hasArt: true, text: "Earn $8 if played hand triggers the Boss Blind ability" },
  { nr: 130, id: "hit_the_road", name: "Hit the Road", rarity: "rare", cost: 8, jokerType: "Xm", activation: "mixed", hasArt: true, text: "This Joker gains X0.5 Mult for every Jack discarded this round" },
  { nr: 131, id: "the_duo", name: "The Duo", rarity: "rare", cost: 8, jokerType: "Xm", activation: "indep", hasArt: true, text: "X2 Mult if played hand contains a Pair" },
  { nr: 132, id: "the_trio", name: "The Trio", rarity: "rare", cost: 8, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult if played hand contains a Three of a Kind" },
  { nr: 133, id: "the_family", name: "The Family", rarity: "rare", cost: 8, jokerType: "Xm", activation: "indep", hasArt: true, text: "X4 Mult if played hand contains a Four of a Kind" },
  { nr: 134, id: "the_order", name: "The Order", rarity: "rare", cost: 8, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult if played hand contains a Straight" },
  { nr: 135, id: "the_tribe", name: "The Tribe", rarity: "rare", cost: 8, jokerType: "Xm", activation: "indep", hasArt: true, text: "X2 Mult if played hand contains a Flush" },
  { nr: 136, id: "stuntman", name: "Stuntman", rarity: "rare", cost: 7, jokerType: "+c", activation: "indep", hasArt: true, text: "+250 Chips, -2 hand size" },
  { nr: 137, id: "invisible_joker", name: "Invisible Joker", rarity: "rare", cost: 8, jokerType: "!!", activation: "passive", hasArt: true, text: "After 2 rounds, sell this card to Duplicate a random Joker" },
  { nr: 138, id: "brainstorm", name: "Brainstorm", rarity: "rare", cost: 10, jokerType: "!!", activation: "passive", hasArt: true, text: "Copies the ability of leftmost Joker" },
  { nr: 139, id: "satellite", name: "Satellite", rarity: "uncommon", cost: 6, jokerType: "+$", activation: "passive", hasArt: true, text: "Earn $1 at end of round per unique Planet card used this run" },
  { nr: 140, id: "shoot_the_moon", name: "Shoot the Moon", rarity: "common", cost: 5, jokerType: "+m", activation: "on_held", hasArt: true, text: "Each Queen held in hand gives +13 Mult" },
  { nr: 141, id: "driver_s_license", name: "Driver's License", rarity: "rare", cost: 7, jokerType: "Xm", activation: "indep", hasArt: true, text: "X3 Mult if you have at least 16 Enhanced cards in your full deck" },
  { nr: 142, id: "cartomancer", name: "Cartomancer", rarity: "uncommon", cost: 6, jokerType: "!!", activation: "passive", hasArt: true, text: "Create a Tarot card when Blind is selected" },
  { nr: 143, id: "astronomer", name: "Astronomer", rarity: "uncommon", cost: 8, jokerType: "!!", activation: "passive", hasArt: true, text: "All Planet cards and Celestial Packs in the shop are free" },
  { nr: 144, id: "burnt_joker", name: "Burnt Joker", rarity: "rare", cost: 8, jokerType: "!!", activation: "on_discard", hasArt: true, text: "Upgrade the level of the first discarded poker hand each round" },
  { nr: 145, id: "bootstraps", name: "Bootstraps", rarity: "uncommon", cost: 7, jokerType: "+m", activation: "indep", hasArt: true, text: "+2 Mult for every $5 you have" },
  { nr: 146, id: "canio", name: "Canio", rarity: "legendary", cost: null, jokerType: "Xm", activation: "indep", hasArt: true, text: "This Joker gains X1 Mult when a face card is destroyed" },
  { nr: 147, id: "triboulet", name: "Triboulet", rarity: "legendary", cost: null, jokerType: "Xm", activation: "on_scored", hasArt: true, text: "Played Kings and Queens each give X2 Mult when scored" },
  { nr: 148, id: "yorick", name: "Yorick", rarity: "legendary", cost: null, jokerType: "Xm", activation: "mixed", hasArt: true, text: "This Joker gains X1 Mult every 23 cards discarded" },
  { nr: 149, id: "chicot", name: "Chicot", rarity: "legendary", cost: null, jokerType: "!!", activation: "passive", hasArt: true, text: "Disables effect of every Boss Blind" },
  { nr: 150, id: "perkeo", name: "Perkeo", rarity: "legendary", cost: null, jokerType: "!!", activation: "passive", hasArt: true, text: "Creates a Negative copy of 1 random consumable card in your possession at the end of the shop" },
];

export const JOKER_CATALOG_BY_ID: ReadonlyMap<string, JokerCatalogEntry> = new Map(
  JOKER_CATALOG.map((j) => [j.id, j]),
);

/** 取某张小丑的美术 key（与 assets/jokers 对齐）。 */
export const catalogArtKey = (id: string): string => jokerArtKey(id);
