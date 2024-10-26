import { useEffect } from 'react';

type WindowEventCallback<K extends keyof WindowEventMap> = (event:WindowEventMap[K])=>void;

export function useWindowEvent<K extends keyof WindowEventMap>(type: K, callback: WindowEventCallback<K>) {

  useEffect(() => {
    window.addEventListener(type, callback);
    return () => {
      window.removeEventListener(type, callback);
    };

  }, []);

}