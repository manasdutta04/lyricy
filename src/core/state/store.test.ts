import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
  it('notifies subscribers on change and skips identical values', () => {
    const store = createStore(1);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(2);
    store.set(2);
    store.set((n) => n + 1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toBe(3);
    unsubscribe();
    store.set(10);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
