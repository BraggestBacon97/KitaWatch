/** Small typed localStorage wrapper. SQLite (tauri-plugin-sql) replaces
 *  the heavy hitters (watch history) later. */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or unavailable — ignore
    }
  },
  remove(key: string): void {
    localStorage.removeItem(key);
  },
};
