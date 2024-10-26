import pack from 'package.json';
import { useEffect } from 'react';

export function usePackageVersion() {
  useEffect(() => {
    // @ts-ignore global setting
    window.__app_version = pack.version;
  }, []);

  return pack.version;
}