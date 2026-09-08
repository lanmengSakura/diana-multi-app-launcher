type Options = {
  refresh: () => Promise<void>;
  onError: () => void;
  isPaused: () => boolean;
  intervalMs: () => number;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (timer: number) => void;
};

/** Completion-based scheduling: a slow IPC request never overlaps the next.
 * Wakes during a request coalesce into one follow-up; dispose never retries. */
export function createStatusPoller(options: Options) {
  let timer: number | undefined;
  let stopped = false;
  let inFlight = false;
  let wakeQueued = false;
  let failures = 0;

  function clear() {
    if (timer !== undefined) options.clearTimer(timer);
    timer = undefined;
  }

  function schedule(delay: number) {
    clear();
    if (!stopped && !options.isPaused()) timer = options.setTimer(() => void tick(), delay);
  }

  async function tick() {
    timer = undefined;
    if (stopped || options.isPaused() || inFlight) return;
    inFlight = true;
    try {
      await options.refresh();
      failures = 0;
    } catch {
      failures = Math.min(failures + 1, 3);
      if (!stopped) options.onError();
    } finally {
      inFlight = false;
      const delay = wakeQueued ? 0 : Math.min(30_000, options.intervalMs() * 2 ** failures);
      wakeQueued = false;
      schedule(delay);
    }
  }

  return {
    wake() {
      if (stopped) return;
      clear();
      failures = 0;
      if (inFlight) wakeQueued = true;
      else schedule(0);
    },
    stop() {
      stopped = true;
      clear();
    }
  };
}
