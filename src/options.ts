export interface Question {
  key: string;
  label: string;
  multi?: boolean;
  options: [value: string, label: string][];
}

export const CORE: Question[] = [
  { key: "who", label: "Who's watching?", options: [["solo", "Just me"], ["partner", "Partner"], ["friends", "Friends"], ["kids", "Family with kids"]] },
  { key: "mood", label: "What's the mood?", options: [["laugh", "Laugh"], ["thrilled", "Thrilled"], ["moved", "Moved"], ["mindbent", "Mind-bent"], ["comforted", "Comforted"]] },
  { key: "time", label: "How much time do you have?", options: [["short", "Under 90 min"], ["medium", "About 2 hours"], ["any", "No limit"]] },
  { key: "energy", label: "How much energy do you have?", options: [["light", "Easy and light"], ["focus", "Full attention"]] },
  { key: "novelty", label: "New or familiar?", options: [["new", "Something new"], ["familiar", "Comfort rewatch"]] },
  { key: "platform", label: "Where can you watch?", options: [["any", "Anywhere"], ["8", "Netflix"], ["9", "Prime Video"], ["337", "Disney+"], ["1899", "Max"], ["350", "Apple TV+"]] },
];

export const MORE: Question[] = [
  { key: "language", label: "Language", options: [["any", "Any"], ["en", "English only"]] },
  { key: "era", label: "Era", options: [["any", "Any"], ["classic", "Classics"], ["recent", "Recent"]] },
  { key: "avoid", label: "Skip these", multi: true, options: [["horror", "Horror"], ["war", "War"], ["romance", "Romance"]] },
];
