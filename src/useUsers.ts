import { useSyncExternalStore } from "react";
import { users, type UserInfo } from "./users";

export const useUsers = (): UserInfo[] => useSyncExternalStore(users.subscribe, users.getAll);
