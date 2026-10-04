export interface Question {
  key: string;
  label: string;
  multi?: boolean;
  options: [value: string, label: string][];
}

export const CORE: Question[] = [
  { key: "who", label: "Who's watching?", options: [["solo", "Just me"], ["partner", "Partner"], ["friends", "Friends"], ["kids", "Family with kids"]] },
  { key: "mood", label: "What's the mood?", options: [["laugh", "Laugh"], ["thrilled", "Thrilled"], ["moved", "Moved"], ["mindbent", "Mind-bent"], ["comforted", "Comforted"], ["twists", "Major plot twists"], ["mystery", "Mysteries"]] },
  { key: "genres", label: "Any genres?", multi: true, options: [["horror", "Horror"], ["comedy", "Comedy"], ["scifi", "Sci-fi"], ["action", "Action"], ["drama", "Drama"], ["thriller", "Thriller"], ["romance", "Romance"], ["animation", "Animation"], ["fantasy", "Fantasy"], ["crime", "Crime"], ["crazynight", "One crazy night"]] },
  { key: "tone", label: "What tone?", options: [["dark", "Dark"], ["serious", "Serious"], ["balanced", "Balanced"], ["light", "Light"], ["funny", "Humorous"]] },
  { key: "time", label: "How much time do you have?", options: [["short", "Under 90 min"], ["medium", "About 2 hours"], ["any", "I don't care"]] },
  { key: "novelty", label: "New or familiar?", options: [["new", "Something new"], ["familiar", "Comfort rewatch"]] },
  { key: "platform", label: "Where can you watch? (pick any)", multi: true, options: [["8", "Netflix"], ["9", "Prime Video"], ["337", "Disney+"], ["1899", "Max"], ["350", "Apple TV+"]] },
];

export const MORE: Question[] = [
  { key: "energy", label: "How much energy do you have?", options: [["light", "Easy and light"], ["focus", "Full attention"]] },
  { key: "avoid", label: "Skip these", multi: true, options: [["horror", "Horror"], ["war", "War"], ["romance", "Romance"]] },
];
