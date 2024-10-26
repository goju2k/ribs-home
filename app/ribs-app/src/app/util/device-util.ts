class DeviceUtilClass {
  
  getDeviceType() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
    if (/android/i.test(userAgent)) {
      return 'Android';
    } if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      return 'iOS';
    }
  
    return 'unknown';
  }

  isAOS() {
    return this.getDeviceType() === 'Android';
  }

  isIOS() {
    return this.getDeviceType() === 'iOS';
  }

  isWeb() {
    return !this.isAOS() && !this.isIOS();
  }

}

export const DeviceUtil = new DeviceUtilClass();