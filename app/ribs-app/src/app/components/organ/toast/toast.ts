import { atom } from 'recoil';

export const GlobalToastMessage = atom<{message:string;}>({
  key: 'global-toast',
  default: { message: '' },
});