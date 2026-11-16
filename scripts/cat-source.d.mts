// type ของ scripts/cat-source.mjs (ให้เทสต์ TypeScript import ได้)
export const ROOT: string;
export const SAMPLES: string;
export const POSES_FILE: string;
export const SLUGS: string[];
export const FRAMES: { line: number; fill: number; tf: string }[];
export const WOB: { line: { baseFrequency: string; scale: string }; fill: { baseFrequency: string; scale: string } };
export const VARIANTS: Record<"color" | "line" | "line-white", { ink: string; cat: string; ear: string; white: string; paper: string }>;
export function loadCats(html?: string): { name: string; use: string; svg: string }[];
export function dedupe(tag: string): string;
export function innerOf(svg: string): string;
export function isClipped(svg: string): boolean;
export function paint(svg: string, colors: { ink: string; cat: string; ear: string; white: string; paper: string }): string;
export function filters(k: string | number, frame: { line: number; fill: number }): string;
export function buildPosesModule(html?: string): string;
