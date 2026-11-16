/** รวม class โดยข้ามค่าว่าง/false */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
