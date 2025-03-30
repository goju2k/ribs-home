import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface NaverMapOptions {
  tiles:string[];
}

const getNaverStyleTemplate = (tiles:string[]):maplibregl.StyleSpecification => ({
  version: 8,
  sources: {
    'naver-tiles': {
      type: 'raster',
      // tiles: [
      //   'https://simg.pstatic.net/onetile/get/195/0/0/{z}/{x}/{y}/bl_vc_bg/ol_vc_an',
      //   '/api/naver/map/static/{x},{y}/{z}',
      // ],
      tiles,
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
      options.style = { ...getNaverStyleTemplate(naverOption.tiles), ...options.style };
    } else {
      throw new Error('MapLibre style must be an object');
    }

    options.maplibreLogo = false;

    // super call
    super(options);
    
    // naver options
    this.naverOption = naverOption;
    
  }

}