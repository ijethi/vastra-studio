/**
 * Process-local memo with a time-to-live. Used by the content readers so the
 * worker and server actions do not hit the database for every job or every
 * validation, while still noticing admin edits within `ttlMs` on other
 * instances (the editing instance invalidates immediately).
 */
export type Memo<T> = {
  get(opts?: { fresh?: boolean }): Promise<T>;
  invalidate(): void;
};

export function createMemo<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now): Memo<T> {
  let value: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;
  return {
    async get(opts) {
      if (!opts?.fresh && value && now() - value.at < ttlMs) return value.data;
      if (!inflight) {
        inflight = load()
          .then((data) => {
            value = { at: now(), data };
            return data;
          })
          .finally(() => {
            inflight = null;
          });
      }
      return inflight;
    },
    invalidate() {
      value = null;
    },
  };
}
