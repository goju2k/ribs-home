import { BLOCK, decodeCollision, WorldData } from '../data/world-data';

/** 1m 격자 충돌 판정 — 건물·물은 못 들어간다 */
export class Collision {

  private grid:Uint8Array;

  private w:number;

  private h:number;

  private cell:number;

  private halfW:number;

  private halfD:number;

  constructor(data:WorldData) {
    this.grid = decodeCollision(data.collision);
    this.w = data.collision.w;
    this.h = data.collision.h;
    this.cell = data.collision.cell;
    this.halfW = data.half.w;
    this.halfD = data.half.d;
  }

  at(x:number, z:number) {
    const cx = Math.floor((x + this.halfW) / this.cell);
    const cz = Math.floor((z + this.halfD) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return BLOCK.WATER;
    return this.grid[cz * this.w + cx];
  }

  /** 반지름 r 원이 막힌 칸에 걸리는지 (중심 + 네 방향) */
  blocked(x:number, z:number, r:number) {
    return this.at(x, z) !== BLOCK.NONE
      || this.at(x + r, z) !== BLOCK.NONE
      || this.at(x - r, z) !== BLOCK.NONE
      || this.at(x, z + r) !== BLOCK.NONE
      || this.at(x, z - r) !== BLOCK.NONE;
  }

  /** 축별로 나눠 움직여 벽을 따라 미끄러지게 */
  move(x:number, z:number, dx:number, dz:number, r:number) {
    let nx = x;
    let nz = z;
    if (!this.blocked(x + dx, z, r)) nx = x + dx;
    if (!this.blocked(nx, z + dz, r)) nz = z + dz;
    return { x: nx, z: nz };
  }

}