import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { profile, user } from "@/db/schema";
import type { AppDb } from "@/db/types";
import * as schema from "@/db/schema";
import { resolveLocale } from "@/lib/i18n/config";
import type { OtpLocale, SendOtpEmail } from "./email-port";
import { INVITE_COOKIE, INVITE_COOKIE_PATH, normalizeInviteCode } from "./invite-code";
import { consumeInvite, isInviteActive } from "./invite-store";
import {
  countOtpSent,
  hitOtpEmailThrottle,
  normalizeEmail,
  otpSentToday,
} from "./throttle";

// Better Auth ตาม ADR 0002 ข้อ 1–3 (แก้ไข 2026-11-18)
// createAuth รับ db + deps เพื่อให้เทสต์ใช้ PGlite กับตัวส่งเมลปลอมได้ · แอปใช้ getAuth() ใน ./instance.ts

export type AuthDeps = {
  sendOtpEmail: SendOtpEmail;
  now?: () => Date;
  /** เพดานเมล OTP ต่อวัน (UTC) — ค่าเริ่ม 400 */
  otpDailyCap?: number;
  /** ส่งงานเบื้องหลัง (เช่น after() ของ Next) — ไม่ใส่ = await การส่งเมลก่อนตอบ */
  runInBackground?: (p: Promise<unknown>) => void;
  baseURL?: string;
  secret?: string;
  /** null = ไม่เปิด Google (ยังไม่มี OAuth client) · overrides ใช้ในเทสต์เท่านั้น (mock การตรวจ id token) */
  /** เปิดการตรวจ Origin/CSRF ของ Better Auth ในเทสต์ (ในโปรดักชันเปิดอยู่แล้ว — ค่าเริ่มของไลบรารีปิดเฉพาะตอนรันเทสต์) */
  enforceOrigin?: boolean;
  google?: ({ clientId: string; clientSecret: string } & Record<string, unknown>) | null;
};

/** เส้นทางของ Better Auth ที่เปิดให้ใช้ — อย่างอื่น 404 (เส้นทางของปลั๊กอินที่เราไม่ใช้ส่งเมล/แก้บัญชีได้) */
export const ALLOWED_AUTH_PATHS = [
  "/sign-in/social",
  "/sign-in/email-otp",
  "/email-otp/send-verification-otp",
  "/sign-out",
  "/get-session",
  "/ok",
  "/error",
] as const;

const TOO_MANY = "Too many requests. Please try again later.";

/** เส้นทางที่สร้าง session ใหม่ได้ — ใช้ล้าง cookie โค้ดเชิญหลังสมัครสำเร็จ */
const SIGN_IN_PATHS = ["/sign-in/email-otp", "/sign-in/social"];

/** logger ของ Better Auth: log เฉพาะข้อความ (ไม่ log object ของ error ซึ่งอาจมีอีเมลจากฐานข้อมูล/ตัวส่งเมล) และตัดสิ่งที่หน้าตาเป็นอีเมลออก */
export function safeLog(level: "debug" | "info" | "warn" | "error", message: string): void {
  const text = String(message).replace(/[^\s@"'<>,;]+@[^\s@"'<>,;]+/g, "[redacted]");
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  out(`[auth] ${text}`);
}

function inviteRequired() {
  return APIError.from("FORBIDDEN", { code: "invite_required", message: "Invite code required" });
}

export function createAuth(db: AppDb, deps: AuthDeps) {
  const now = () => (deps.now ? deps.now() : new Date());
  const cap = deps.otpDailyCap ?? 400;

  async function resolveOtpLocale(email: string, cookieValue: string | null | undefined): Promise<OtpLocale> {
    const rows = await db
      .select({ locale: profile.locale })
      .from(user)
      .innerJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.email, email))
      .limit(1);
    if (rows[0]) return resolveLocale(rows[0].locale);
    return resolveLocale(cookieValue ?? undefined);
  }

  return betterAuth({
    secret: deps.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: deps.baseURL,
    database: drizzleAdapter(db as never, { provider: "pg", schema }),
    // id สร้างในโค้ดเสมอ (ADR 0001) — ห้ามใช้ generateId: "uuid"
    logger: { level: "warn", log: safeLog },
    advanced: {
      ...(deps.enforceOrigin ? { disableOriginCheck: false } : {}),
      database: { generateId: () => crypto.randomUUID() },
      ...(deps.runInBackground ? { backgroundTasks: { handler: deps.runInBackground } } : {}),
    },
    // ต้องเปิดเอง — ค่าเริ่มเปิดเฉพาะ production · กฎต่อเส้นทางชนะกฎของปลั๊กอิน (ADR 0002 ข้อ 3)
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/email-otp/send-verification-otp": { window: 600, max: 5 },
        "/sign-in/email-otp": { window: 600, max: 10 },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    user: {
      additionalFields: {
        inviteCodeId: { type: "string", required: false, input: false, returned: false },
      },
    },
    socialProviders: deps.google ? { google: { scope: ["openid", "email", "profile"], disableDefaultScope: true, ...deps.google } } : {},
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        disableSignUp: false,
        async sendVerificationOTP({ email, otp }, ctx) {
          const to = normalizeEmail(email);
          // นับก่อนส่งเสมอ (อนุรักษ์: ไม่ให้เกินเพดานของ Gmail)
          await countOtpSent(db, now());
          const locale = await resolveOtpLocale(to, ctx?.getCookie("NEXT_LOCALE"));
          await deps.sendOtpEmail({ to, otp, locale });
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        const allowed = (ALLOWED_AUTH_PATHS as readonly string[]).includes(path) || path.startsWith("/callback/");
        if (!allowed) throw APIError.from("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });
        if (path !== "/email-otp/send-verification-otp") return;

        // จุดกั้นก่อนส่ง OTP (ADR 0002 ข้อ 2) — ลำดับ (1) ชนิด (2) throttle ต่ออีเมล (3) เพดานรายวัน (4) บัญชี/โค้ดเชิญ
        const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown };
        if (body.type !== "sign-in") {
          throw APIError.from("BAD_REQUEST", { code: "INVALID_OTP_TYPE", message: "Invalid OTP type" });
        }
        // กติกาเดียวกับปลั๊กอินเป๊ะ (ตัวพิมพ์เล็ก ไม่ตัดช่องว่าง + ตัวตรวจรูปแบบเดียวกัน) — รูปแบบผิดปล่อยให้ปลั๊กอินตอบ 400 INVALID_EMAIL เหมือนกันทุกกรณี
        const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
        if (!z.email().safeParse(email).success) return;

        const t = now();
        const th = await hitOtpEmailThrottle(db, email, t);
        if (!th.allowed) {
          throw new APIError(
            "TOO_MANY_REQUESTS",
            { code: "too_many_requests", message: TOO_MANY },
            { "X-Retry-After": String(th.retryAfterS) },
          );
        }
        if ((await otpSentToday(db, t)) >= cap) {
          throw new APIError("SERVICE_UNAVAILABLE", { code: "email_unavailable", message: "Email unavailable" });
        }
        const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
        if (existing.length === 0) {
          const code = normalizeInviteCode(ctx.getCookie(INVITE_COOKIE));
          const active = code ? await isInviteActive(db, code, t) : false;
          // ตอบเหมือนส่งจริงทุกไบต์ · ไม่สร้าง OTP ไม่ส่งเมล
          if (!active) return ctx.json({ success: true });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned: unknown = ctx.context.returned;
        // คำตอบของการยืนยัน OTP ผิดต้องเหมือนกันทุกกรณี: เกินจำนวนครั้ง/หมดอายุ (เกิดเฉพาะอีเมลที่มี OTP จริง) → INVALID_OTP
        if (ctx.path === "/sign-in/email-otp" && isAPIError(returned)) {
          const code = (returned.body as { code?: unknown } | undefined)?.code;
          if (code === "TOO_MANY_ATTEMPTS" || code === "OTP_EXPIRED") {
            // ต้องคืน Response (ไม่ใช่ throw APIError): ไลบรารีคง status เดิมของ error ต้นทาง (403) ไว้เสมอ
            const same = APIError.from("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
            return new Response(JSON.stringify(same.body), { status: same.statusCode, headers: { "content-type": "application/json" } });
          }
        }
        // สมัคร/เข้าสำเร็จ (มี session ใหม่) → ล้าง cookie โค้ดเชิญที่ใช้เสร็จแล้ว
        const isSignIn = SIGN_IN_PATHS.includes(ctx.path) || ctx.path.startsWith("/callback/");
        if (isSignIn && ctx.context.newSession && ctx.getCookie(INVITE_COOKIE)) {
          ctx.setCookie(INVITE_COOKIE, "", {
            maxAge: 0,
            path: INVITE_COOKIE_PATH,
            httpOnly: true,
            sameSite: "lax",
            secure: ctx.context.baseURL.startsWith("https:"),
          });
        }
      }),
    },
    databaseHooks: {
      // ไม่เก็บ IP/User-Agent ใน session (ลดข้อมูลที่เก็บ) — ตัวนับ rate limit ใช้ IP แยกต่างหาก
      session: {
        create: { before: async () => ({ data: { ipAddress: null, userAgent: null } }) },
      },
      user: {
        update: { before: async () => ({ data: { image: null } }) },
        create: {
          // จุดเดียวที่ใช้สิทธิ์โค้ดเชิญ (ทั้ง Google และ OTP) · ctx เป็น null = เรียกนอก endpoint → ปฏิเสธเสมอ
          async before(_u, ctx) {
            if (!ctx) throw inviteRequired();
            const code = normalizeInviteCode(ctx.getCookie(INVITE_COOKIE));
            if (!code) throw inviteRequired();
            const id = await consumeInvite(db, code, now());
            if (!id) throw inviteRequired();
            // ไม่รับชื่อ/รูปจาก body ของ OTP (ผู้ใช้ตั้งชื่อตอน onboarding) · ชื่อจาก Google เก็บได้ รูปไม่เก็บ
            const viaOtp = ctx.path === "/sign-in/email-otp";
            return { data: { inviteCodeId: id, image: null, ...(viaOtp ? { name: "" } : {}) } };
          },
        },
      },
      // ไม่เก็บ token ของ Google (เราไม่ใช้) — A3
      account: {
        create: { before: async () => ({ data: NO_TOKENS }) },
        update: { before: async () => ({ data: NO_TOKENS }) },
      },
    },
  });
}

const NO_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

export type Auth = ReturnType<typeof createAuth>;
