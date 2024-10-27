import { Position } from '@mint-ui/map';
import { useEffect, useState } from 'react';

export function useGeoLocationHook(askFlag:boolean = false) {

  const [ currPosition, setCurrPosition ] = useState<Position>();

  useEffect(() => {
    
    if (askFlag) {
      getPosition();
    }

  }, [ askFlag ]);

  const getPosition = () => {

    // Check if geolocation is available
    if ('geolocation' in navigator) {
      // Request position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // On success
          const { latitude } = position.coords;
          const { longitude } = position.coords;
          console.log('Latitude:', latitude);
          console.log('Longitude:', longitude);
          setCurrPosition(new Position(latitude, longitude));
        },
        (error) => {
          setCurrPosition(undefined);
          // On error
          console.error('Error retrieving location:', error);
        },
      );
    } else {
      setCurrPosition(undefined);
      console.log('Geolocation is not supported by this browser.');
    }

  };

  return currPosition;
}