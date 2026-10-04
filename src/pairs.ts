// "This or that" rows. value = TMDB search text (movies) or a taste id (taste).
// Add a year in brackets to disambiguate remakes: "Dune (2021)".
export interface Side { label: string; value: string }
export interface Pair { key: string; a: Side; b: Side }

const m = (key: string, a: string, b: string, av = a, bv = b): Pair => ({
  key, a: { label: a, value: av }, b: { label: b, value: bv },
});

export const MOVIE_PAIRS: Pair[] = [
  m("m1", "The Dark Knight", "Inception"),
  m("m2", "Interstellar", "The Martian"),
  m("m3", "Se7en", "Gone Girl"),
  m("m4", "Fight Club", "The Wolf of Wall Street"),
  m("m5", "John Wick", "Mission: Impossible", "John Wick", "Mission: Impossible (1996)"),
  m("m6", "Superbad", "The Hangover"),
  m("m7", "Get Out", "The Conjuring"),
  m("m8", "Dune", "Star Wars", "Dune (2021)", "Star Wars (1977)"),
  m("m9", "The Social Network", "Moneyball"),
  m("m10", "Whiplash", "Black Swan"),
  m("m11", "Prisoners", "Zodiac"),
  m("m12", "Shutter Island", "The Prestige"),
  m("m13", "Goodfellas", "The Godfather"),
  m("m14", "Mad Max: Fury Road", "Blade Runner 2049"),
  m("m15", "Parasite", "Knives Out", "Parasite (2019)", "Knives Out"),
];

export const TASTE_PAIRS: Pair[] = [
  m("t1", "Great plot, average characters", "Great characters, average plot", "plot", "characters"),
  m("t2", "Amazing visuals, simple story", "Average visuals, brilliant story", "visuals", "story"),
  m("t3", "Makes you laugh a lot", "Keeps you completely tense", "laugh", "tense"),
  m("t4", "Makes you think", "Makes you feel", "think", "feel"),
  m("t5", "One you fully understand", "One you keep thinking about", "understand", "linger"),
  m("t6", "A satisfying ending", "A shocking ending", "satisfying", "shocking"),
  m("t7", "Realistic but predictable", "Unrealistic but unpredictable", "realistic", "unpredictable"),
  m("t8", "One incredible protagonist", "Several interesting characters", "protagonist", "ensemble"),
  m("t9", "Constant action", "Slow buildup, huge payoff", "action", "slow"),
  m("t10", "Dark and brilliant", "Fun and imperfect", "dark", "fun"),
  m("t11", "Original and risky", "Familiar and polished", "original", "polished"),
  m("t12", "A hidden gem", "A famous classic", "gem", "classic"),
  m("t13", "Similar to one I love", "Something completely different", "similar", "different"),
];
