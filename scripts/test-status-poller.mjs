import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/status-poller.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture(refresh = async () => {}) {
  let time = 0, nextId = 0, paused = false, errors = 0, calls = 0, delay = 5000;
  const timers = new Map();
  const poller = exports.createStatusPoller({
    refresh: async () => { calls++; await refresh(); },
    onError: () => errors++, isPaused: () => paused, intervalMs: () => delay,
    setTimer: (fn, ms) => { const id = ++nextId; timers.set(id, { at: time + ms, fn }); return id; },
    clearTimer: id => timers.delete(id)
  });
  return {
    poller, timers,
    get calls() { return calls; }, get errors() { return errors; },
    setPaused(value) { paused = value; }, setDelay(value) { delay = value; },
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      time = end; await flush();
    }
  };
}

test('a 30-second slow query stays single-flight, including repeated wakes', async () => {
  let complete;
  const f = fixture(() => new Promise(resolve => { complete = resolve; }));
  f.poller.wake(); await f.advance(0);
  for (let i = 0; i < 8; i++) f.poller.wake();
  await f.advance(30_000);
  assert.equal(f.calls, 1); assert.equal(f.timers.size, 0);
  complete(); await flush(); await f.advance(0);
  assert.equal(f.calls, 2);
  f.poller.stop(); complete(); await flush();
  assert.equal(f.timers.size, 0);
});

test('steady polling waits five seconds AFTER completion', async () => {
  const f = fixture(); f.poller.wake(); await f.advance(0);
  assert.equal(f.calls, 1);
  await f.advance(4999); assert.equal(f.calls, 1);
  await f.advance(1); assert.equal(f.calls, 2);
  f.poller.stop();
});

test('hidden/busy state pauses; returning or explicitly rescanning wakes immediately', async () => {
  const f = fixture(); f.poller.wake(); await f.advance(0);
  f.setPaused(true); f.poller.wake(); await f.advance(60_000);
  assert.equal(f.calls, 1); assert.equal(f.timers.size, 0);
  f.setPaused(false); f.poller.wake(); await f.advance(0);
  assert.equal(f.calls, 2);
  f.poller.stop();
});

test('failures back off to 10/20/30 seconds and an explicit wake retries', async () => {
  const f = fixture(async () => { throw new Error('mock IPC unavailable'); });
  f.poller.wake(); await f.advance(0); assert.equal(f.errors, 1);
  await f.advance(9999); assert.equal(f.calls, 1);
  await f.advance(1); assert.equal(f.errors, 2);
  await f.advance(20_000); assert.equal(f.errors, 3);
  await f.advance(30_000); assert.equal(f.errors, 4);
  f.poller.wake(); await f.advance(0); assert.equal(f.calls, 5);
  f.poller.stop();
});

test('dispose cancels queued work and ignores a late IPC failure', async () => {
  let reject;
  const f = fixture(() => new Promise((_, no) => { reject = no; }));
  f.poller.wake(); await f.advance(0); f.poller.stop();
  reject(new Error('late')); await flush(); await f.advance(60_000);
  assert.equal(f.calls, 1); assert.equal(f.errors, 0); assert.equal(f.timers.size, 0);
});

test('StrictMode setup/cleanup does not issue the discarded initial query', async () => {
  const f = fixture(); f.poller.wake(); f.poller.stop(); await f.advance(0);
  assert.equal(f.calls, 0);
});

test('waiting for an explicitly requested exit keeps the faster 2.5-second interval', async () => {
  const f = fixture(); f.setDelay(2500); f.poller.wake(); await f.advance(2500);
  assert.equal(f.calls, 2); f.poller.stop();
});
