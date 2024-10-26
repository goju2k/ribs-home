import { DeviceUtil } from './device-util';

class CopyUtilClass {
  
  copyToClipboard(text:string) {

    const textArea = document.createElement('textarea');
    textArea.value = text;
  
    // Avoid scrolling when copying the link
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
  
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (!DeviceUtil.isAOS()) {
      alert('링크가 복사되었습니다.');
    }

  }

  copyToClipboardToHome() {

    this.copyToClipboard('https://www.instar.my');

  }

}

export const CopyUtil = new CopyUtilClass();