import { useSyncExternalStore } from "react";
import { votes, type VoteStore } from "./votes";

export const useVotes = (): VoteStore => useSyncExternalStore(votes.subscribe, votes.getAll);
