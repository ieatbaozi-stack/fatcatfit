// ข้อผิดพลาดที่แปลงเป็นคำตอบ HTTP ได้ตรงๆ — ใช้ร่วม repository (data/server) กับ route handler
// รูปคำตอบ: { code, ...extra } · code เป็นสตริงคงที่ให้ UI แยกแยะ (ไม่ใช่ข้อความภาษามนุษย์)

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
    public readonly headers: Record<string, string> = {},
  ) {
    super(code);
    this.name = "HttpError";
  }
}
