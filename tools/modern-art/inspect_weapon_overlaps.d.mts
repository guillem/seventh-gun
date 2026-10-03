import type { Object3D } from 'three';
export function coplanarOverlaps(root: Object3D, tolerance?: number): {
  area: number;
  axis: string;
  plane: number;
  a: { name: string; material: string; triangle: number };
  b: { name: string; material: string; triangle: number };
}[];
