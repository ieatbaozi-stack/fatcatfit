// type ของ scripts/cat-source.mjs (ให้เทสต์ TypeScript import ได้)
type Colors = { ink: string; cat: string; ear: string; white: string; paper: string };
type Seeds = { line: number; fill: number };
export const ROOT: string;
export const SAMPLES: string;
export const POSES_FILE: string;
export const SLUGS: string[];
export const WOB: { line: { baseFrequency: string; scale: string; seed: number }; fill: { baseFrequency: string; scale: string; seed: number } };
export const STILL_SEEDS: Seeds;
/** @deprecated ใช้ STILL_SEEDS */
export const FRAMES: Seeds[];
export const VARIANTS: Record<"color" | "line" | "line-white", Colors>;
export const PAD: number;
export const BOX: number;
export function loadCats(html?: string): { name: string; use: string; svg: string }[];
export function dedupe(tag: string): string;
export function innerOf(svg: string): string;
export function isClipped(svg: string): boolean;
export function paint(svg: string, colors: Colors): string;
export function filters(k?: string | number, frame?: Seeds): string;
export function stickerSVG(svg: string, colors: Colors | null, clip: boolean): string;
export function stickerName(i: number): string;
export function poseFrames(svg: string, i: number): { doc: unknown; els: string[]; still: string; frames: string[] };
export function expandLayer(els: readonly string[], layer: string): string;
export function buildPosesModule(html?: string): string;
