import SunCalc from 'suncalc';

class SunPositionClass {

  getSunPositionInfo({ lat: latitude, lng: longitude }:{lat:number; lng:number;}) {
    
    const now = new Date();
    const sunPos = SunCalc.getPosition(now, latitude, longitude);
    
    const sunAzimuth = (sunPos.azimuth * 180 / Math.PI + 180) % 360; // Ensure 0-360°
    const sunAltitude = sunPos.altitude * (180 / Math.PI); // Convert to degrees
    console.log('sunAzimuth 지평선상 각도', sunAzimuth, 'sunAltitude 해의 높이', sunAltitude);
    return {
      sunAzimuth,
      sunAltitude,
    };

  }
  
}

export const SunPositionUtil = new SunPositionClass();