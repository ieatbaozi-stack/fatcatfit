// spike A4 (ADR 0002 ข้อ 4): after() + SMTP บน Vercel ส่งถึงจริงครบ 20/20 ไหม
// ยิงคำขอ OTP ไปที่ preview จริง 20 ครั้ง แล้วให้คนนับเมลในกล่องจดหมาย — ไม่ต่อฐานข้อมูล ไม่อ่านกล่องจดหมาย
//   SPIKE_BASE_URL=https://<preview> SPIKE_EMAIL=<อีเมลทดสอบที่มีบัญชีหรือมีโค้ดเชิญ> npx tsx scripts/spike-a4.ts
// เว้นช่วง 125 วินาที เพราะ customRules ของเรา: send-verification-otp 5 ครั้ง/600 วินาที/IP (create-auth.ts) → ทั้งหมด ~42 นาที
// ไม่พิมพ์อีเมลเต็มหรือค่าอื่นของสภาพแวดล้อม · ไม่ส่งเมลจริงตอนรันเทสต์ (ไฟล์นี้ไม่มีเทสต์ และไม่ถูกเรียกจาก CI)

const COUNT = Number(process.env.SPIKE_COUNT ?? 20);
const GAP_MS = Number(process.env.SPIKE_GAP_MS ?? 125_000);

function mask(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? `${email[0]}***${email.slice(at)}` : "***";
}

async function main(): Promise<number> {
  const base = process.env.SPIKE_BASE_URL?.replace(/\/+$/, "");
  const email = process.env.SPIKE_EMAIL;
  if (!base || !email) {
    console.error("usage: SPIKE_BASE_URL and SPIKE_EMAIL must be set");
    return 2;
  }
  if (!/^https:\/\//.test(base)) {
    console.error("SPIKE_BASE_URL must be an https:// preview URL");
    return 2;
  }
  console.log(`spike A4: ${COUNT} sends to ${mask(email)} via ${new URL(base).host}, gap ${GAP_MS / 1000}s`);
  let ok = 0;
  for (let n = 1; n <= COUNT; n++) {
    const t0 = Date.now();
    let status = 0;
    try {
      const res = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ email, type: "sign-in" }),
      });
      status = res.status;
    } catch (e) {
      console.log(`${n}/${COUNT} network error: ${(e as Error).name}`);
    }
    if (status === 200) ok++;
    console.log(`${n}/${COUNT} status=${status} ms=${Date.now() - t0}`);
    if (n < COUNT) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  console.log(`done: HTTP 200 = ${ok}/${COUNT} · ตอนนี้นับเมลในกล่องจดหมาย (inbox + spam) ต้องได้ ${COUNT} ฉบับ`);
  return ok === COUNT ? 0 : 1;
}

process.exitCode = await main();

export {};
