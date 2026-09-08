use std::sync::Mutex;
use std::time::{Duration, Instant};

/// For blocking probes only: callers must already be off the UI thread.
/// Holding the lock through a cache miss coalesces concurrent requests. Cache
/// age starts after the probe completes, including for a negative result.
pub(crate) struct ProbeCache<T> {
    entry: Mutex<Option<(Instant, T)>>,
}

impl<T: Clone> ProbeCache<T> {
    pub(crate) const fn new() -> Self {
        Self {
            entry: Mutex::new(None),
        }
    }

    pub(crate) fn invalidate(&self) {
        *self.entry.lock().unwrap_or_else(|error| error.into_inner()) = None;
    }

    pub(crate) fn get(&self, ttl: Duration, force: bool, probe: impl FnOnce() -> T) -> T {
        let mut entry = self.entry.lock().unwrap_or_else(|error| error.into_inner());
        if !force {
            if let Some((at, value)) = entry.as_ref() {
                if at.elapsed() < ttl {
                    return value.clone();
                }
            }
        }
        let value = probe();
        *entry = Some((Instant::now(), value.clone()));
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn missing_result_is_cached_and_explicit_rescan_bypasses_it() {
        let cache = ProbeCache::<Option<u8>>::new();
        let calls = AtomicUsize::new(0);
        let probe = || {
            calls.fetch_add(1, Ordering::SeqCst);
            None
        };
        for _ in 0..30 {
            assert_eq!(cache.get(Duration::from_secs(120), false, probe), None);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            cache.get(Duration::from_secs(120), true, || Some(1)),
            Some(1)
        );
        assert_eq!(cache.get(Duration::from_secs(120), false, probe), Some(1));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn expires_old_entries() {
        let cache = ProbeCache {
            entry: Mutex::new(Some((Instant::now() - Duration::from_secs(121), 1))),
        };
        assert_eq!(cache.get(Duration::from_secs(120), false, || 2), 2);
    }

    #[test]
    fn concurrent_misses_run_one_probe_and_timestamp_is_after_completion() {
        let cache = ProbeCache::new();
        let calls = AtomicUsize::new(0);
        let barrier = std::sync::Barrier::new(8);
        let finished = Mutex::new(None);
        std::thread::scope(|scope| {
            for _ in 0..8 {
                scope.spawn(|| {
                    barrier.wait();
                    assert_eq!(
                        cache.get(Duration::from_secs(120), false, || {
                            calls.fetch_add(1, Ordering::SeqCst);
                            std::thread::sleep(Duration::from_millis(20));
                            *finished.lock().unwrap() = Some(Instant::now());
                            false
                        }),
                        false
                    );
                });
            }
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(
            cache.entry.lock().unwrap().as_ref().unwrap().0 >= finished.lock().unwrap().unwrap()
        );
    }
}
