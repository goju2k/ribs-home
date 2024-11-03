import { Position } from '@mint-ui/map';
import { atom, useSetRecoilState } from 'recoil';

interface MapControls {
  temperatureFlag:boolean;
  opacity:number;
  tmText:string;
  currPosition?: Position;
  askPosition:boolean;
}

export const MapControlState = atom<MapControls>({
  key: 'map-controls',
  default: {
    temperatureFlag: false,
    opacity: 0.4,
    tmText: '',
    askPosition: false,
  },
});

export function useUpdateMapControl<T extends keyof MapControls>() {
  const setState = useSetRecoilState(MapControlState);
  return (property:T, value:MapControls[T]) => {
    setState((prev) => ({ ...prev, [property]: value }));
  };
}