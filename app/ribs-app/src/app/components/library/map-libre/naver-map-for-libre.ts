import maplibregl from 'maplibre-gl';

export interface NaverMapOptions {
  mapKey: string;
}

const getNaverStyleTemplate = ():maplibregl.StyleSpecification => ({
  version: 8,
  sources: {
    'naver-tiles': {
      type: 'raster',
      tiles: [
        // 'https://simg.pstatic.net/onetile/get/195/0/0/{z}/{x}/{y}/bl_vc_bg/ol_vc_an',
        '/api/naver/map/static/{x},{y}/{z}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'naver-map',
      type: 'raster',
      source: 'naver-tiles',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
});

export class NaverMapForLibre extends maplibregl.Map {

  // naver options
  naverOption;

  constructor(options: maplibregl.MapOptions, naverOption: NaverMapOptions) {

    // style assign
    if (options.style === undefined || typeof options.style === 'object') {
      options.style = { ...getNaverStyleTemplate(), ...options.style };
    } else {
      throw new Error('MapLibre style must be an object');
    }

    // super call
    super(options);
    
    // naver options
    this.naverOption = naverOption;
    
  }

}