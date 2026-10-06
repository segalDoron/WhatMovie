import { useSyncExternalStore } from "react";
import { searchHistory, type SavedSearch } from "./searchHistory";

export const useSearchHistory = (): SavedSearch[] => useSyncExternalStore(searchHistory.subscribe, searchHistory.getAll);
