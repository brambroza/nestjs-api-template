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
  'AUTH.INVALID_CREDENTIALS': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'AUTH.USER_INACTIVE': 'บัญชีผู้ใช้ถูกระงับการใช้งาน',
  'AUTH.INVALID_PERMISSION_RULE':
    'ข้อมูลสิทธิ์การใช้งานผิดรูปแบบ กรุณาติดต่อผู้ดูแลระบบ',

  'MASTER_DATA.CUSTOMER_NOT_FOUND': 'ไม่พบข้อมูลลูกค้าที่ระบุ',
  'MASTER_DATA.DUPLICATE_CUSTOMER_CODE': 'รหัสลูกค้านี้ถูกใช้งานแล้ว',
  'MASTER_DATA.INVALID_CUSTOMER_FIELD': 'ข้อมูลลูกค้าไม่ถูกต้อง',
  'MASTER_DATA.VENDOR_NOT_FOUND': 'ไม่พบข้อมูลผู้ขายที่ระบุ',
  'MASTER_DATA.DUPLICATE_VENDOR_CODE': 'รหัสผู้ขายนี้ถูกใช้งานแล้ว',
  'MASTER_DATA.INVALID_VENDOR_FIELD': 'ข้อมูลผู้ขายไม่ถูกต้อง',
  'MASTER_DATA.ITEM_NOT_FOUND': 'ไม่พบข้อมูลสินค้าที่ระบุ',
  'MASTER_DATA.DUPLICATE_ITEM_SKU': 'รหัสสินค้า (SKU) นี้ถูกใช้งานแล้ว',
  'MASTER_DATA.INVALID_ITEM_FIELD': 'ข้อมูลสินค้าไม่ถูกต้อง',
  'MASTER_DATA.UOM_NOT_FOUND': 'ไม่พบข้อมูลหน่วยนับที่ระบุ',
  'MASTER_DATA.DUPLICATE_UOM_CODE': 'รหัสหน่วยนับนี้ถูกใช้งานแล้ว',
  'MASTER_DATA.INVALID_UOM_FIELD': 'ข้อมูลหน่วยนับไม่ถูกต้อง',

  'DOMAIN.INVALID_THAI_TAX_ID':
    'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักและเลขตรวจสอบถูกต้อง)',
  'MASTER_DATA.COMPANY_NOT_FOUND': 'ไม่พบข้อมูลบริษัทที่ระบุ',
  'MASTER_DATA.DUPLICATE_COMPANY_CODE': 'รหัสบริษัทนี้ถูกใช้งานแล้ว',
  'MASTER_DATA.INVALID_COMPANY_FIELD': 'ข้อมูลบริษัทไม่ถูกต้อง',
  'MASTER_DATA.BRANCH_NOT_FOUND': 'ไม่พบข้อมูลสาขาที่ระบุ',
  'MASTER_DATA.DUPLICATE_BRANCH_CODE': 'รหัสสาขานี้ถูกใช้งานแล้ว',
  'MASTER_DATA.DUPLICATE_BRANCH_NUMBER':
    'เลขที่สาขานี้ถูกใช้งานแล้วสำหรับบริษัทนี้',
  'MASTER_DATA.BRANCH_COMPANY_INVALID':
    'บริษัทที่ระบุไม่มีอยู่หรือถูกระงับการใช้งาน',
  'MASTER_DATA.INVALID_BRANCH_FIELD': 'ข้อมูลสาขาไม่ถูกต้อง',
  'MASTER_DATA.WAREHOUSE_NOT_FOUND': 'ไม่พบข้อมูลคลังสินค้าที่ระบุ',
  'MASTER_DATA.DUPLICATE_WAREHOUSE_CODE': 'รหัสคลังสินค้านี้ถูกใช้งานแล้ว',
  'MASTER_DATA.WAREHOUSE_BRANCH_INVALID':
    'สาขาที่ระบุไม่มีอยู่หรือถูกระงับการใช้งาน',
  'MASTER_DATA.DEFAULT_WAREHOUSE_EXISTS':
    'สาขานี้มีคลังสินค้าหลักอยู่แล้ว กำหนดคลังหลักได้เพียงคลังเดียวต่อสาขา',
  'MASTER_DATA.INVALID_WAREHOUSE_FIELD': 'ข้อมูลคลังสินค้าไม่ถูกต้อง',

  'DOMAIN.INVALID_ADDRESS': 'ข้อมูลที่อยู่ไม่ถูกต้อง',
  'MASTER_DATA.PARTNER_NOT_FOUND':
    'ไม่พบข้อมูลลูกค้า/ผู้ขายที่ระบุ หรือถูกระงับการใช้งาน',
  'MASTER_DATA.CONTACT_NOT_FOUND': 'ไม่พบข้อมูลผู้ติดต่อที่ระบุ',
  'MASTER_DATA.PRIMARY_CONTACT_EXISTS':
    'มีผู้ติดต่อหลักอยู่แล้ว กำหนดผู้ติดต่อหลักได้เพียงคนเดียว',
  'MASTER_DATA.INVALID_CONTACT_FIELD': 'ข้อมูลผู้ติดต่อไม่ถูกต้อง',
  'MASTER_DATA.ADDRESS_NOT_FOUND': 'ไม่พบข้อมูลที่อยู่ที่ระบุ',
  'MASTER_DATA.DEFAULT_ADDRESS_EXISTS':
    'มีที่อยู่หลักประเภทนี้อยู่แล้ว กำหนดที่อยู่หลักได้เพียงรายการเดียวต่อประเภท',
  'MASTER_DATA.INVALID_ADDRESS_FIELD': 'ข้อมูลที่อยู่ไม่ถูกต้อง',
  'MASTER_DATA.INVALID_CONSENT_FIELD': 'ข้อมูลการให้ความยินยอมไม่ถูกต้อง',
  'MASTER_DATA.PDPA_REQUEST_NOT_FOUND': 'ไม่พบคำขอใช้สิทธิ์ตาม PDPA ที่ระบุ',
  'MASTER_DATA.PDPA_REQUEST_ALREADY_OPEN':
    'มีคำขอประเภทนี้ที่ยังดำเนินการไม่เสร็จอยู่แล้ว',
  'MASTER_DATA.PDPA_REQUEST_ILLEGAL_TRANSITION':
    'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว ไม่สามารถเปลี่ยนสถานะได้อีก',
  'MASTER_DATA.INVALID_PDPA_REQUEST_FIELD': 'ข้อมูลคำขอไม่ถูกต้อง',

  'MASTER_DATA.ITEM_CATEGORY_NOT_FOUND': 'ไม่พบหมวดหมู่สินค้าที่ระบุ',
  'MASTER_DATA.DUPLICATE_ITEM_CATEGORY_CODE':
    'รหัสหมวดหมู่สินค้านี้ถูกใช้งานแล้ว',
  'MASTER_DATA.INVALID_ITEM_CATEGORY_FIELD': 'ข้อมูลหมวดหมู่สินค้าไม่ถูกต้อง',
  'MASTER_DATA.PRICE_LIST_NOT_FOUND': 'ไม่พบรายการราคาที่ระบุ',
  'MASTER_DATA.DUPLICATE_PRICE_LIST_CODE': 'รหัสรายการราคานี้ถูกใช้งานแล้ว',
  'MASTER_DATA.DUPLICATE_PRICE_LIST_LINE':
    'รายการราคานี้มีราคาสำหรับสินค้า/หน่วย/ขั้นจำนวนนี้อยู่แล้ว',
  'MASTER_DATA.INVALID_PRICE_LIST_FIELD': 'ข้อมูลรายการราคาไม่ถูกต้อง',
  'MASTER_DATA.PRICE_LIST_REF_INVALID':
    'สินค้า ลูกค้า หรือหน่วยนับที่อ้างอิงไม่มีอยู่ในระบบ',
  'MASTER_DATA.NO_PRICE_FOUND':
    'ไม่พบราคาที่ใช้ได้สำหรับสินค้าและเงื่อนไขที่ระบุ',
  'MASTER_DATA.BOM_NOT_FOUND': 'ไม่พบสูตรการผลิต (BOM) ที่ระบุ',
  'MASTER_DATA.DUPLICATE_BOM_VERSION':
    'สินค้านี้มีสูตรการผลิตเวอร์ชันนี้อยู่แล้ว',
  'MASTER_DATA.BOM_PRODUCT_INVALID':
    'สินค้าที่จะกำหนดสูตรการผลิตไม่มีอยู่หรือถูกระงับ',
  'MASTER_DATA.BOM_COMPONENT_INVALID': 'ส่วนประกอบในสูตรการผลิตไม่ถูกต้อง',
  'MASTER_DATA.BOM_CYCLE':
    'สูตรการผลิตนี้จะทำให้สินค้าเป็นส่วนประกอบของตัวเอง (วนซ้ำ)',
  'MASTER_DATA.INVALID_BOM': 'ข้อมูลสูตรการผลิตไม่ถูกต้อง',
  'MASTER_DATA.IMPORT_TOO_LARGE':
    'ไฟล์นำเข้ามีจำนวนแถวเกินกำหนด (สูงสุด 10,000 แถวต่อไฟล์)',
  'MASTER_DATA.IMPORT_FILE_INVALID':
    'ไฟล์นำเข้าไม่ถูกต้อง หรือขาดคอลัมน์ที่จำเป็น',

  'DOMAIN.INVALID_DATE': 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)',
  'FINANCE.CURRENCY_NOT_FOUND': 'ไม่พบสกุลเงินที่ระบุในระบบ',
  'FINANCE.DUPLICATE_CURRENCY_CODE': 'รหัสสกุลเงินนี้ถูกใช้งานแล้ว',
  'FINANCE.INVALID_CURRENCY_FIELD': 'ข้อมูลสกุลเงินไม่ถูกต้อง',
  'FINANCE.FX_RATE_NOT_FOUND':
    'ไม่พบอัตราแลกเปลี่ยนสำหรับวันที่และสกุลเงินที่ระบุ',
  'FINANCE.INVALID_FX_RATE': 'ข้อมูลอัตราแลกเปลี่ยนไม่ถูกต้อง',
  'FINANCE.FX_SOURCE_UNAVAILABLE':
    'ไม่สามารถดึงอัตราแลกเปลี่ยนจากธนาคารแห่งประเทศไทยได้ในขณะนี้',
  'FINANCE.TAX_CODE_NOT_FOUND': 'ไม่พบรหัสภาษีที่ระบุ',
  'FINANCE.DUPLICATE_TAX_CODE': 'รหัสภาษีนี้ถูกใช้งานแล้ว',
  'FINANCE.DEFAULT_TAX_CODE_EXISTS':
    'มีรหัสภาษีค่าเริ่มต้นของประเภทนี้อยู่แล้ว กำหนดได้เพียงรหัสเดียว',
  'FINANCE.NO_TAX_CODE_FOR_KIND':
    'ยังไม่ได้กำหนดรหัสภาษีค่าเริ่มต้นของประเภทนี้',
  'FINANCE.INVALID_TAX_CODE_FIELD': 'ข้อมูลรหัสภาษีไม่ถูกต้อง',
  'FINANCE.ACCOUNT_NOT_FOUND': 'ไม่พบบัญชีในผังบัญชี',
  'FINANCE.DUPLICATE_ACCOUNT_CODE': 'รหัสบัญชีนี้ถูกใช้งานแล้ว',
  'FINANCE.INVALID_ACCOUNT_FIELD': 'ข้อมูลผังบัญชีไม่ถูกต้อง',
  'FINANCE.FISCAL_YEAR_NOT_FOUND': 'ไม่พบปีบัญชีที่ระบุ',
  'FINANCE.DUPLICATE_FISCAL_YEAR': 'ชื่อปีบัญชีนี้ถูกใช้งานแล้วสำหรับบริษัทนี้',
  'FINANCE.FISCAL_YEAR_OVERLAP': 'ช่วงเวลาของปีบัญชีทับซ้อนกับปีบัญชีที่มีอยู่',
  'FINANCE.FISCAL_YEAR_COMPANY_INVALID': 'บริษัทที่ระบุไม่มีอยู่หรือถูกระงับ',
  'FINANCE.INVALID_FISCAL_YEAR_FIELD': 'ข้อมูลปีบัญชีไม่ถูกต้อง',
  'FINANCE.FISCAL_PERIOD_NOT_FOUND': 'ไม่พบงวดบัญชีที่ระบุ',
  'FINANCE.ILLEGAL_PERIOD_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะงวดบัญชีจากสถานะปัจจุบันได้',
  'FINANCE.FISCAL_YEAR_NOT_READY_TO_CLOSE':
    'ต้องล็อกทุกงวดบัญชีก่อนจึงจะปิดปีบัญชีได้',
  'FINANCE.FISCAL_YEAR_CLOSED': 'ปีบัญชีนี้ปิดแล้ว ไม่สามารถแก้ไขได้',

  'APPROVAL.POLICY_NOT_FOUND': 'ไม่พบนโยบายการอนุมัติที่ระบุ',
  'APPROVAL.ACTIVE_POLICY_EXISTS':
    'เอกสารประเภทนี้มีนโยบายการอนุมัติที่ใช้งานอยู่แล้ว',
  'APPROVAL.INVALID_POLICY': 'ข้อมูลนโยบายการอนุมัติไม่ถูกต้อง',
  'APPROVAL.REQUEST_NOT_FOUND': 'ไม่พบคำขออนุมัติที่ระบุ',
  'APPROVAL.NOT_PENDING': 'คำขออนุมัตินี้ดำเนินการเสร็จสิ้นแล้ว',
  'APPROVAL.PENDING_EXISTS': 'เอกสารนี้มีคำขออนุมัติที่รอดำเนินการอยู่แล้ว',
  'APPROVAL.NOT_ELIGIBLE': 'คุณไม่มีสิทธิ์อนุมัติขั้นตอนนี้',
  'APPROVAL.SELF_APPROVAL': 'ผู้ขออนุมัติไม่สามารถอนุมัติเอกสารของตนเองได้',
  'APPROVAL.ALREADY_DECIDED': 'คุณได้ตัดสินขั้นตอนนี้ไปแล้ว',
  'APPROVAL.NOT_THE_REQUESTER': 'เฉพาะผู้ขออนุมัติเท่านั้นที่ยกเลิกคำขอได้',
  'APPROVAL.INVALID_REQUEST': 'ข้อมูลคำขออนุมัติไม่ถูกต้อง',
  'APPROVAL.DELEGATION_NOT_FOUND': 'ไม่พบการมอบอำนาจที่ระบุ',
  'APPROVAL.INVALID_DELEGATION': 'ข้อมูลการมอบอำนาจไม่ถูกต้อง',

  'SALES.QUOTATION_NOT_FOUND': 'ไม่พบใบเสนอราคาที่ระบุ',
  'SALES.ILLEGAL_QUOTATION_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะใบเสนอราคาจากสถานะปัจจุบันได้',
  'SALES.QUOTATION_NOT_EDITABLE': 'แก้ไขได้เฉพาะใบเสนอราคาสถานะร่างเท่านั้น',
  'SALES.QUOTATION_EXPIRED': 'ใบเสนอราคาหมดอายุแล้ว',
  'SALES.INVALID_QUOTATION': 'ข้อมูลใบเสนอราคาไม่ถูกต้อง',
  'SALES.VERSION_CONFLICT':
    'เอกสารถูกแก้ไขโดยผู้ใช้อื่นแล้ว กรุณาโหลดใหม่แล้วลองอีกครั้ง',
  'SALES.REF_INVALID':
    'ข้อมูลอ้างอิง (บริษัท/ลูกค้า/สินค้า/สกุลเงิน) ไม่ถูกต้อง',
  'SALES.CURRENCY_MISMATCH': 'สกุลเงินของราคาสินค้าไม่ตรงกับสกุลเงินของเอกสาร',
  'SALES.ORDER_NOT_FOUND': 'ไม่พบใบสั่งขายที่ระบุ',
  'SALES.ILLEGAL_ORDER_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะใบสั่งขายจากสถานะปัจจุบันได้',
  'SALES.ORDER_NOT_EDITABLE': 'แก้ไขได้เฉพาะใบสั่งขายสถานะร่างเท่านั้น',
  'SALES.INVALID_ORDER': 'ข้อมูลใบสั่งขายไม่ถูกต้อง',
  'SALES.CREDIT_LIMIT_EXCEEDED':
    'ยอดหนี้คงค้างเกินวงเงินเครดิตของลูกค้า และไม่มีนโยบายอนุมัติรองรับ',
  'SALES.APPROVAL_PENDING': 'ใบสั่งขายยังรอการอนุมัติอยู่',
  'SALES.OVER_DELIVERY': 'จำนวนที่ส่งมอบเกินจำนวนคงเหลือในใบสั่งขาย',
  'SALES.QUOTATION_NOT_CONVERTIBLE':
    'ใบเสนอราคานี้ไม่สามารถแปลงเป็นใบสั่งขายได้ (ต้องเป็นสถานะตอบรับและยังไม่เคยแปลง)',
  'SALES.ORDER_HAS_DELIVERIES':
    'ใบสั่งขายนี้มีการส่งมอบแล้ว ไม่สามารถยกเลิกได้',
  'SALES.DELIVERY_NOTE_NOT_FOUND': 'ไม่พบใบส่งสินค้าที่ระบุ',
  'SALES.ILLEGAL_DELIVERY_NOTE_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะใบส่งสินค้าจากสถานะปัจจุบันได้',
  'SALES.INVALID_DELIVERY_NOTE': 'ข้อมูลใบส่งสินค้าไม่ถูกต้อง',
  'DOMAIN.INVALID_DOCUMENT_LINE': 'ข้อมูลรายการสินค้าในเอกสารไม่ถูกต้อง',

  'PURCHASE.REF_INVALID':
    'ข้อมูลอ้างอิง (บริษัท/ผู้ขาย/สินค้า/คลัง/สกุลเงิน) ไม่ถูกต้อง',
  'PURCHASE.VERSION_CONFLICT':
    'เอกสารถูกแก้ไขโดยผู้ใช้อื่นแล้ว กรุณาโหลดใหม่แล้วลองอีกครั้ง',
  'PURCHASE.APPROVAL_PENDING': 'เอกสารยังรอการอนุมัติอยู่',
  'PURCHASE.OVER_RECEIPT': 'จำนวนที่รับเกินจำนวนคงเหลือในใบสั่งซื้อ',
  'PURCHASE.REQUISITION_NOT_FOUND': 'ไม่พบใบขอซื้อที่ระบุ',
  'PURCHASE.ILLEGAL_REQUISITION_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะใบขอซื้อจากสถานะปัจจุบันได้',
  'PURCHASE.REQUISITION_NOT_EDITABLE': 'แก้ไขได้เฉพาะใบขอซื้อสถานะร่างเท่านั้น',
  'PURCHASE.INVALID_REQUISITION': 'ข้อมูลใบขอซื้อไม่ถูกต้อง',
  'PURCHASE.REQUISITION_NOT_CONVERTIBLE':
    'ใบขอซื้อนี้ไม่สามารถแปลงเป็นใบสั่งซื้อได้ (ต้องได้รับอนุมัติและยังไม่เคยแปลง)',
  'PURCHASE.ORDER_NOT_FOUND': 'ไม่พบใบสั่งซื้อที่ระบุ',
  'PURCHASE.ILLEGAL_ORDER_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะใบสั่งซื้อจากสถานะปัจจุบันได้',
  'PURCHASE.ORDER_NOT_EDITABLE': 'แก้ไขได้เฉพาะใบสั่งซื้อสถานะร่างเท่านั้น',
  'PURCHASE.INVALID_ORDER': 'ข้อมูลใบสั่งซื้อไม่ถูกต้อง',
  'PURCHASE.ORDER_HAS_RECEIPTS':
    'ใบสั่งซื้อนี้มีการรับสินค้าแล้ว ไม่สามารถยกเลิกได้',
  'PURCHASE.GOODS_RECEIPT_NOT_FOUND': 'ไม่พบใบรับสินค้าที่ระบุ',
  'PURCHASE.ILLEGAL_GOODS_RECEIPT_TRANSITION':
    'ไม่สามารถเปลี่ยนสถานะใบรับสินค้าจากสถานะปัจจุบันได้',
  'PURCHASE.INVALID_GOODS_RECEIPT': 'ข้อมูลใบรับสินค้าไม่ถูกต้อง',
};

const FALLBACK_TH = 'เกิดข้อผิดพลาดที่ไม่คาดคิด';

export function messageThForCode(code: string): string {
  return MESSAGES_TH[code] ?? FALLBACK_TH;
}
