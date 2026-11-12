import { useEffect, useState } from 'preact/hooks';
import type { Store } from './store';

export function useStore<T>(store: Store<T>): T {
  const [value, setValue] = useState(store.get);
  useEffect(() => {
    setValue(store.get());
    return store.subscribe(setValue);
  }, [store]);
  return value;
}
