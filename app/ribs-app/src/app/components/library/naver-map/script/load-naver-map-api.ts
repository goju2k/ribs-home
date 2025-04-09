/* eslint-disable @typescript-eslint/ban-ts-comment */

export interface NaverMapLoadParams {
  scriptUrl:string;
  scriptModules?:string[];
  scriptParams?:Record<string, string>;
}

export async function loadNaverMapApi({
  scriptUrl,
  scriptModules = [],
  scriptParams = {},
}:NaverMapLoadParams): Promise<boolean> {

  return new Promise<boolean>((resolve) => {
    
    const callbackName = getRandomFunctionName('load_naver');

    let loaded = false;
    
    // @ts-ignore
    window[callbackName] = () => {
      console.log('naver map api loaded');
      loaded = true;
      // @ts-ignore
      delete window[callbackName];
    };

    const params = {
      submodules: scriptModules.join(','),
      callback: callbackName,
      ...scriptParams,
    };
    
    loadScript(buildUrl(scriptUrl, params), 'naver_map_api_script', () => loaded === true).then(async (callbackExecFlag) => {

      if (!callbackExecFlag) {
        loaded = true;
        // @ts-ignore
        delete window[callbackName];
      }
  
      const ok = await waiting(() => loaded);
  
      if (!ok) {
        console.error('naver script api load failed!!');
      }

      resolve(true);
      console.log('naver map script loaded');

    });
  });

}

function getRandomFunctionName(prefix:string) {
  return `${prefix}_${Date.now()}_${performance.now().toFixed(0)}`;
}

async function loadScript(url:string, id:string, checkLoaded:()=>boolean) {

  return new Promise<boolean>((resolve) => {

    if (checkLoaded()) {
      resolve(false);
      return;
    }

    const prevElement = id ? document.getElementById(id) : undefined;

    if (prevElement) {

      prevElement.addEventListener('load', () => {
        resolve(false);
      });
      
      return;

    }
    
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.defer = true;
    id && (script.id = id);
    script.addEventListener('load', () => {
      resolve(true);
    });

    document.body.appendChild(script);

  });

}

function buildUrl(baseUrl: string, param: { [ key: string ]: string | string[] | boolean | undefined; }): string {
  const params = Object.entries(param).map(([ key, value ]) => {
    const temp = Array.isArray(value) ? value.join(',') : value;

    return `${key}=${temp}`;
  }).join('&');

  return `${baseUrl}?${params}`;
}

export async function waiting(evaluation:()=>boolean, timeoutSeconds?:number):Promise<boolean> {

  const max = (timeoutSeconds || 5) * 1000;
  return new Promise((resolve) => {
    
    const start = new Date().getTime();
    const inter = setInterval(() => {
      
      const time = new Date().getTime();
      if (time - start > max) {
        clearInterval(inter);
        resolve(false);
        return;
      }

      if (evaluation()) {
        clearInterval(inter);
        resolve(true);
      }

    }, 100);

  });

}