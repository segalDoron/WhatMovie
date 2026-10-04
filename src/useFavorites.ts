import { useSyncExternalStore } from "react";
import { favorites, type Favorite } from "./favorites";

export const useFavorites = (): Favorite[] => useSyncExternalStore(favorites.subscribe, favorites.getAll);
