import { useEffect, useState } from 'preact/hooks';
import type { WxtStorageItem } from '#imports';

/** Live value of a WXT storage item (fallback until loaded). */
export function useSetting<T>(item: WxtStorageItem<T, Record<string, unknown>>): T {
  const [value, setValue] = useState<T>(item.fallback);
  useEffect(() => {
    let alive = true;
    item.getValue().then((v) => alive && setValue(v));
    const unwatch = item.watch((v) => setValue(v));
    return () => {
      alive = false;
      unwatch();
    };
  }, [item]);
  return value;
}
