/**
 * Thai translations keyed by domain error code. Kept as a plain table
 * because Nest i18n modules would be overkill for a controlled set of
 * codes. If the same code needs richer localization later (e.g. Chinese
 * or English variants per tenant), swap this file for an i18n adapter
 * behind the same lookup function.
 */
export const MESSAGES_TH: Readonly<Record<string, string>> = {
  'PRODUCTION_ORDER.NOT_FOUND': 'ไม่พบใบสั่งผลิตที่ระบุ',
  'PRODUCTION_ORDER.ILLEGAL_STATUS_TRANSITION':
    'สถานะปัจจุบันไม่สามารถเปลี่ยนไปเป็นสถานะที่ร้องขอได้',
  'PRODUCTION_ORDER.SEGREGATION_OF_DUTIES':
    'ผู้ใช้ที่สร้างใบสั่งไม่สามารถอนุมัติใบของตัวเองได้',
  'PRODUCTION_ORDER.DUAL_APPROVAL_REQUIRED':
    'ใบสั่งนี้มีมูลค่าเกินเพดาน ต้องการผู้อนุมัติเพิ่มอีกหนึ่งคน',
  'PRODUCTION_ORDER.SECOND_APPROVER_MUST_DIFFER':
    'ผู้อนุมัติคนที่สองต้องเป็นคนละคนกับผู้อนุมัติคนแรก',
  'PRODUCTION_ORDER.OVERPRODUCTION': 'จำนวนผลิตเกินเกณฑ์ที่กำหนด',
  'PRODUCTION_ORDER.MATERIAL_SHORTAGE': 'วัตถุดิบไม่เพียงพอสำหรับการปล่อยผลิต',
  'PRODUCTION_ORDER.OPTIMISTIC_LOCK':
    'มีผู้อื่นแก้ไขข้อมูลนี้ในเวลาเดียวกัน กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง',

  'DOMAIN.NEGATIVE_QUANTITY': 'จำนวนติดลบไม่ถูกต้อง',
  'DOMAIN.QUANTITY_UOM_MISMATCH': 'หน่วยของจำนวนไม่ตรงกัน',
  'DOMAIN.MONEY_MISMATCH': 'สกุลเงินไม่ตรงกัน',
  'DOMAIN.INVALID_ID': 'รหัสไม่ถูกต้อง',
  'DOMAIN.INVALID_BOM_LINE': 'ข้อมูลรายการวัตถุดิบไม่ถูกต้อง',
  'DOMAIN.INVALID_TOLERANCE_POLICY': 'ค่ากำหนดค่าคลาดเคลื่อนไม่ถูกต้อง',

  'AUTH.TENANT_CONTEXT_MISSING': 'ระบุ Tenant ในคำขอไม่ถูกต้อง',
  'AUTH.USER_CONTEXT_MISSING': 'ระบุผู้ใช้ในคำขอไม่ถูกต้อง',
};

const FALLBACK_TH = 'เกิดข้อผิดพลาดที่ไม่คาดคิด';

export function messageThForCode(code: string): string {
  return MESSAGES_TH[code] ?? FALLBACK_TH;
}
