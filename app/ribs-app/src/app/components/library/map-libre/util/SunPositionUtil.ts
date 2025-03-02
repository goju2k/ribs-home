import SunCalc from 'suncalc';

class SunPositionClass {

  getSunPositionInfo({ lat: latitude, lng: longitude, option = {} }:{lat:number; lng:number; option?:{
    azimuthTo180?: boolean;
  };}) {
    
    const now = new Date();
    const sunPos = SunCalc.getPosition(now, latitude, longitude);
    
    let sunAzimuth = (sunPos.azimuth * 180 / Math.PI); // Ensure 0-360°
    
    if (option?.azimuthTo180) {
      sunAzimuth = (sunAzimuth > 0 ? (180 - sunAzimuth) : (sunAzimuth + 180)) % 180;
    }

    const sunAltitude = sunPos.altitude * (180 / Math.PI); // Convert to degrees
    console.log('sunAzimuth 지평선상 각도', sunAzimuth, 'sunAltitude 해의 높이', sunAltitude);
    return {
      sunAzimuth,
      sunAltitude,
    };

  }
  
}

export const SunPositionUtil = new SunPositionClass();