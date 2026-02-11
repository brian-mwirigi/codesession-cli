import { useEffect, useRef } from 'react';

/**
 * Custom hook for polling at a regular interval.
 * Calls `callback` immediately and then every `delay` ms.
 * Pass `null` for delay to pause.
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
