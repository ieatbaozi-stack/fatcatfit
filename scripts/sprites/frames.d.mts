// type ของ scripts/sprites/frames.mjs (ให้เทสต์ TypeScript import ได้)
export interface SvgItem {
  tag: string;
  attrs: Record<string, string>;
  d: string;
  filter: string;
  fg: number;
  anc: number[];
  base: number[];
  ownM: number[];
  sw: number;
}
export interface SvgDoc {
  defs: string;
  items: SvgItem[];
  fgs: { box: number[]; above: number[] }[];
}
export interface FrameOptions {
  fixFilters?: boolean;
}
export const NFRAMES: number;
export function parseSVG(src: string): SvgDoc;
export function pathEnds(d: string): { start: number[]; end: number[] };
export function pathBBox(d: string): number[];
export function bodyMatrix(rig: unknown, i: number): number[];
export function frameLayout(doc: SvgDoc, rig: unknown, i: number, opts?: FrameOptions): unknown[];
export function serializeLayout(doc: SvgDoc, runs: unknown[], prefix: string): string;
export function renderFrame(doc: SvgDoc, rig: unknown, i: number, prefix: string, opts?: FrameOptions): string;
export function elementTag(el: SvgItem, d: string | null, tf: string | null): string;
export function rectTag(r: number[]): string;
