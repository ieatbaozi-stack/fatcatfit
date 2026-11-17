// เจ้าของ: ops-release · กฎขอบเขตโมดูลตาม docs/design/ARCHITECTURE.md ข้อ 3
// การเพิ่มกฎของบทบาทอื่นให้เพิ่มเป็นก้อนแยกท้ายไฟล์ ไม่แก้ก้อนที่มีอยู่
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---- ขอบเขตโมดูล (ARCHITECTURE ข้อ 3) ----------------------------------------
// ข้อควรระวัง: no-restricted-imports ของไฟล์เดียวกันที่ถูกหลายก้อน "แทนที่" กัน ไม่ได้รวมกัน
// จึงต้องไม่ให้ glob ของแต่ละก้อนทับกัน (ดู ignores ของก้อนหน้าจอ)

const msg = (text) => text;

const DB = {
  group: ["@/db", "@/db/**", "**/db", "**/db/**"],
  message: msg("ห้าม import src/db ตรงๆ — ผ่าน repository ใน src/lib/data/server (ARCHITECTURE ข้อ 3)"),
};
const DATA_SERVER = {
  group: ["@/lib/data/server", "@/lib/data/server/**", "**/lib/data/server", "**/lib/data/server/**"],
  message: msg("โค้ดฝั่งเซิร์ฟเวอร์ (lib/data/server) — import จากหน้าจอ/ไคลเอนต์ไม่ได้"),
};
const AUTH_SERVER = {
  group: ["@/lib/auth/server", "@/lib/auth/server/**", "**/lib/auth/server", "**/lib/auth/server/**"],
  message: msg("lib/auth/server เป็นโค้ดฝั่งเซิร์ฟเวอร์ — หน้าจอใช้ lib/auth/client"),
};
const EMAIL = {
  group: ["@/lib/email", "@/lib/email/**", "**/lib/email", "**/lib/email/**"],
  message: msg("lib/email ใช้ได้เฉพาะ route handler และ lib/auth"),
};
const APP = {
  group: ["@/app", "@/app/**"],
  message: msg("โมดูลชั้นล่างห้าม import src/app"),
};
const COMPONENTS = {
  group: ["@/components", "@/components/**"],
  message: msg("ห้าม import React component จากโมดูลนี้"),
};
const OFFLINE = {
  group: ["@/lib/offline", "@/lib/offline/**"],
  message: msg("lib/offline ใช้ได้เฉพาะหน้าจอ"),
};
const AUTH_ALL = {
  group: ["@/lib/auth", "@/lib/auth/**"],
  message: msg("โมดูลนี้ไม่มี I/O — import lib/auth ไม่ได้"),
};
const SERVER_ONLY_PKG = {
  name: "server-only",
  message: msg("โมดูลนี้ต้องใช้ได้ทั้งไคลเอนต์และเซิร์ฟเวอร์"),
};
const FRAMEWORK = {
  group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*"],
  message: msg("โมดูลนี้ไม่ผูกกับ React/Next"),
};
const IO_PACKAGES = {
  group: ["pg", "drizzle-orm", "drizzle-orm/*", "better-auth", "better-auth/*", "@better-auth/*", "idb", "node:*"],
  message: msg("โมดูลนี้ต้องไม่มี I/O (ฐานข้อมูล ไฟล์ เครือข่าย)"),
};

const restrict = (paths = [], patterns = []) => ({
  "no-restricted-imports": ["error", { paths, patterns }],
});

const boundaries = [
  // หน้าจอ: src/app/** (ไม่รวม api) และ src/components/**
  {
    name: "boundaries/screens",
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**"],
    rules: restrict([], [DB, DATA_SERVER, AUTH_SERVER, EMAIL]),
  },
  // route handler: ห้ามแตะ src/db ตรงๆ
  {
    name: "boundaries/api",
    files: ["src/app/api/**/*.{ts,tsx}"],
    rules: restrict([], [DB]),
  },
  // คิวออฟไลน์: คุยกับเซิร์ฟเวอร์ด้วย fetch เท่านั้น
  {
    name: "boundaries/offline",
    files: ["src/lib/offline/**/*.{ts,tsx}"],
    rules: restrict([SERVER_ONLY_PKG], [DB, DATA_SERVER, AUTH_SERVER, EMAIL, APP, COMPONENTS, FRAMEWORK, IO_PACKAGES]),
  },
  // repository ฝั่งเซิร์ฟเวอร์
  {
    name: "boundaries/data-server",
    files: ["src/lib/data/server/**/*.{ts,tsx}"],
    rules: restrict([], [APP, COMPONENTS, OFFLINE]),
  },
  // auth: ฝั่งเซิร์ฟเวอร์ใช้ db/email ได้ แต่ห้ามแตะ src/app
  {
    name: "boundaries/auth",
    files: ["src/lib/auth/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/client.{ts,tsx}"],
    rules: restrict([], [APP, COMPONENTS, OFFLINE]),
  },
  // auth client ถูกรวมเข้าไคลเอนต์ — ห้ามดึงโค้ดเซิร์ฟเวอร์เข้ามา
  {
    name: "boundaries/auth-client",
    files: ["src/lib/auth/client.{ts,tsx}"],
    rules: restrict([SERVER_ONLY_PKG], [DB, DATA_SERVER, AUTH_SERVER, EMAIL, APP, COMPONENTS]),
  },
  // ฟังก์ชันบริสุทธิ์ที่ใช้ร่วมไคลเอนต์/เซิร์ฟเวอร์
  {
    name: "boundaries/pure",
    files: ["src/lib/stats/**/*.{ts,tsx}", "src/lib/data/shared/**/*.{ts,tsx}"],
    rules: restrict([SERVER_ONLY_PKG], [DB, DATA_SERVER, AUTH_ALL, EMAIL, OFFLINE, APP, COMPONENTS, FRAMEWORK, IO_PACKAGES]),
  },
  // service worker แยกจากแอป
  {
    name: "boundaries/pwa",
    files: ["src/pwa/**/*.{ts,tsx}"],
    rules: restrict(
      [SERVER_ONLY_PKG],
      [{ group: ["@/*"], message: msg("src/pwa แยกจากโค้ดแอป — import ผ่าน alias @/ ไม่ได้") }],
    ),
  },
  // เทสต์ต้อง import ตัวช่วยฝั่งเซิร์ฟเวอร์ได้ (เช่น @/db/testing/pglite) — ขอบเขตบังคับกับโค้ดจริง
  {
    name: "boundaries/tests-exempt",
    files: ["**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaries,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**", ".claude/**", "docs/**", "assets/**", "playwright-report/**", "test-results/**"]),
]);
