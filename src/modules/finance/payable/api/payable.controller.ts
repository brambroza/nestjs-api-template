import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import { MAX_DISCOUNT_BP, MAX_DOCUMENT_LINES } from '../../../../shared/domain';
import {
  ApAgingUseCase,
  CashForecastUseCase,
  CreatePaymentBatchUseCase,
  CreatePaymentVoucherUseCase,
  CreateVendorInvoiceUseCase,
  GetPaymentBatchUseCase,
  GetPaymentVoucherUseCase,
  GetVendorInvoiceUseCase,
  GetWhtCertificateUseCase,
  ListPaymentVouchersUseCase,
  ListVendorInvoicesUseCase,
  ListWhtCertificatesUseCase,
  PostPaymentBatchUseCase,
  PostPaymentVoucherUseCase,
  PostVendorInvoiceUseCase,
  VoidPaymentBatchUseCase,
  VoidPaymentVoucherUseCase,
  VoidVendorInvoiceUseCase,
} from '../application';
import {
  PaymentMethod,
  VendorInvoiceStatus,
  VoucherStatus,
  type PaymentBatch,
  type PaymentVoucher,
  type VendorInvoice,
  type WhtCertificateSnapshot,
} from '../domain';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- DTOs ------------------------------------------------------------------

export class VendorLineRequestDto {
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 36)
  purchaseOrderLineId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) itemId?: string;
  @Expose() @IsString() @Matches(INT) quantity!: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) unitPriceMinor?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 200) description?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DISCOUNT_BP)
  discountBp?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 36) whtTaxCodeId?: string;
}

export class CreateVendorInvoiceRequestDto {
  @Expose() @IsOptional() @IsString() @Length(1, 36) companyId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) vendorId?: string;
  @Expose() @IsString() @Length(1, 64) vendorInvoiceNumber!: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) purchaseOrderId?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) invoiceDate?: string;
  @Expose() @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  priceToleranceBp?: number;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => VendorLineRequestDto)
  lines?: VendorLineRequestDto[];
}

export class VendorInvoiceActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @Expose() @IsOptional() @IsBoolean() acceptVariance?: boolean;
  @Expose() @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class ListVendorInvoicesQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(VendorInvoiceStatus))
  status?: VendorInvoiceStatus;
  @Expose() @IsOptional() @IsString() @Length(1, 36) vendorId?: string;
}

export class VoucherAllocationRequestDto {
  @Expose() @IsString() @Length(1, 36) invoiceId!: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) amountMinor?: string;
}

export class CreateVoucherRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Length(1, 36) vendorId!: string;
  @Expose()
  @IsString()
  @IsIn(Object.values(PaymentMethod))
  method!: PaymentMethod;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) paymentDate?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 100) reference?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 32) chequeNumber?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 100) chequeBank?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) chequeDate?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => VoucherAllocationRequestDto)
  allocations?: VoucherAllocationRequestDto[];
}

export class ActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

export class ListVouchersQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose()
  @IsOptional()
  @IsString()
  @IsIn(Object.values(VoucherStatus))
  status?: VoucherStatus;
  @Expose() @IsOptional() @IsString() @Length(1, 36) vendorId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) batchId?: string;
}

export class CreateBatchRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose()
  @IsString()
  @IsIn(Object.values(PaymentMethod))
  method!: PaymentMethod;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) paymentDate?: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  voucherIds?: string[];
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  vendorIds?: string[];
}

export class ListCertificatesQueryDto {
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @Expose() @IsOptional() @IsString() @Length(1, 36) vendorId?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) from?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) to?: string;
}

export class ApAgingQueryDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) asOf?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) vendorId?: string;
}

export class CashForecastQueryDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) asOf?: string;
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  weeks?: number;
}

export class VendorInvoiceResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() vendorInvoiceNumber!: string;
  @Expose() vendorId!: string;
  @Expose() vendorName!: string;
  @Expose() vendorTaxId!: string | null;
  @Expose() purchaseOrderId!: string | null;
  @Expose() currency!: string;
  @Expose() invoiceDate!: string;
  @Expose() dueDate!: string;
  @Expose() paymentTermsDays!: number;
  @Expose() status!: string;
  @Expose() matchStatus!: string;
  @Expose() matchIssues!: string[];
  @Expose() subtotalMinor!: string;
  @Expose() discountMinor!: string;
  @Expose() taxMinor!: string;
  @Expose() totalMinor!: string;
  @Expose() settledMinor!: string;
  @Expose() balanceMinor!: string;
  @Expose() whtBases!: Array<{
    taxCode: string;
    rateBp: number;
    incomeType: string | null;
    baseMinor: string;
  }>;
  @Expose() notes!: string | null;
  @Expose() version!: number;
  @Expose() lines!: Array<Record<string, string | number | null>>;
  @Expose() postedAt!: string | null;
  @Expose() voidedAt!: string | null;
  @Expose() createdAt!: string;
}

export class VendorInvoiceListResponseDto {
  @Expose()
  @Type(() => VendorInvoiceResponseDto)
  items!: VendorInvoiceResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class VoucherResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() vendorId!: string;
  @Expose() batchId!: string | null;
  @Expose() currency!: string;
  @Expose() paymentDate!: string;
  @Expose() method!: string;
  @Expose() grossMinor!: string;
  @Expose() whtMinor!: string;
  @Expose() netPaidMinor!: string;
  @Expose() reference!: string | null;
  @Expose() chequeNumber!: string | null;
  @Expose() chequeBank!: string | null;
  @Expose() chequeDate!: string | null;
  @Expose() status!: string;
  @Expose() allocations!: Array<{
    invoiceId: string;
    amountMinor: string;
    whtMinor: string;
  }>;
  @Expose() version!: number;
  @Expose() postedAt!: string | null;
  @Expose() voidedAt!: string | null;
  @Expose() createdAt!: string;
}

export class VoucherListResponseDto {
  @Expose() @Type(() => VoucherResponseDto) items!: VoucherResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class BatchResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() paymentDate!: string;
  @Expose() method!: string;
  @Expose() currency!: string;
  @Expose() status!: string;
  @Expose() voucherCount!: number;
  @Expose() totalNetMinor!: string;
  @Expose() totalWhtMinor!: string;
  @Expose() version!: number;
  @Expose() postedAt!: string | null;
  @Expose() @Type(() => VoucherResponseDto) vouchers!: VoucherResponseDto[];
}

export class CertificateResponseDto {
  @Expose() id!: string;
  @Expose() number!: string;
  @Expose() voucherId!: string;
  @Expose() pndForm!: string;
  @Expose() vendorId!: string;
  @Expose() vendorName!: string;
  @Expose() vendorTaxId!: string | null;
  @Expose() paymentDate!: string;
  @Expose() totalBaseMinor!: string;
  @Expose() totalTaxMinor!: string;
  @Expose() isVoid!: boolean;
  @Expose() lines!: Array<{
    lineNo: number;
    taxCode: string;
    incomeType: string;
    rateBp: number;
    baseMinor: string;
    taxMinor: string;
  }>;
}

export class CertificateListResponseDto {
  @Expose()
  @Type(() => CertificateResponseDto)
  items!: CertificateResponseDto[];
  @Expose() total!: number;
  @Expose() limit!: number;
  @Expose() offset!: number;
}

export class ApAgingResponseDto {
  @Expose() asOf!: string;
  @Expose() totalMinor!: string;
  @Expose() rows!: Array<{
    vendorId: string;
    buckets: Record<string, string>;
    totalMinor: string;
    openInvoices: number;
  }>;
}

export class CashForecastResponseDto {
  @Expose() asOf!: string;
  @Expose() totalMinor!: string;
  @Expose() buckets!: Array<{
    label: string;
    from: string;
    to: string | null;
    amountMinor: string;
    invoices: number;
  }>;
}

function toInvoiceDto(inv: VendorInvoice): VendorInvoiceResponseDto {
  const s = inv.snapshot();
  const d = new VendorInvoiceResponseDto();
  Object.assign(d, {
    id: s.id,
    companyId: s.companyId,
    number: s.number,
    vendorInvoiceNumber: s.vendorInvoiceNumber,
    vendorId: s.vendorId,
    vendorName: s.vendorName,
    vendorTaxId: s.vendorTaxId,
    purchaseOrderId: s.purchaseOrderId,
    currency: s.currency,
    invoiceDate: s.invoiceDate,
    dueDate: s.dueDate,
    paymentTermsDays: s.paymentTermsDays,
    status: s.status,
    matchStatus: s.matchStatus,
    matchIssues: [...s.matchIssues],
    subtotalMinor: s.subtotalMinor.toString(),
    discountMinor: s.discountMinor.toString(),
    taxMinor: s.taxMinor.toString(),
    totalMinor: s.totalMinor.toString(),
    settledMinor: s.settledMinor.toString(),
    balanceMinor: s.balanceMinor.toString(),
    whtBases: inv.whtBases().map((b) => ({
      taxCode: b.taxCode,
      rateBp: b.rateBp,
      incomeType: b.incomeType,
      baseMinor: b.baseMinor.toString(),
    })),
    notes: s.notes,
    version: s.version,
    lines: s.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      itemId: l.itemId,
      itemSku: l.itemSku,
      description: l.description,
      uomCode: l.uomCode,
      quantity: l.quantity.toString(),
      unitPriceMinor: l.unitPriceMinor.toString(),
      discountBp: l.discountBp,
      netMinor: l.netMinor.toString(),
      taxCode: l.taxCode,
      taxRateBp: l.taxRateBp,
      taxMinor: l.taxMinor.toString(),
      totalMinor: l.totalMinor.toString(),
      purchaseOrderLineId: l.purchaseOrderLineId,
      whtTaxCode: l.whtTaxCode,
      whtRateBp: l.whtRateBp,
    })),
    postedAt: s.postedAt?.toISOString() ?? null,
    voidedAt: s.voidedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  });
  return d;
}

function toVoucherDto(v: PaymentVoucher): VoucherResponseDto {
  const s = v.snapshot();
  const d = new VoucherResponseDto();
  Object.assign(d, {
    id: s.id,
    companyId: s.companyId,
    number: s.number,
    vendorId: s.vendorId,
    batchId: s.batchId,
    currency: s.currency,
    paymentDate: s.paymentDate,
    method: s.method,
    grossMinor: s.grossMinor.toString(),
    whtMinor: s.whtMinor.toString(),
    netPaidMinor: s.netPaidMinor.toString(),
    reference: s.reference,
    chequeNumber: s.chequeNumber,
    chequeBank: s.chequeBank,
    chequeDate: s.chequeDate,
    status: s.status,
    allocations: s.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amountMinor: a.amountMinor.toString(),
      whtMinor: a.whtMinor.toString(),
    })),
    version: s.version,
    postedAt: s.postedAt?.toISOString() ?? null,
    voidedAt: s.voidedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  });
  return d;
}

function toBatchDto(
  b: PaymentBatch,
  vouchers: readonly PaymentVoucher[],
): BatchResponseDto {
  const s = b.snapshot();
  const d = new BatchResponseDto();
  Object.assign(d, {
    id: s.id,
    companyId: s.companyId,
    number: s.number,
    paymentDate: s.paymentDate,
    method: s.method,
    currency: s.currency,
    status: s.status,
    voucherCount: s.voucherCount,
    totalNetMinor: s.totalNetMinor.toString(),
    totalWhtMinor: s.totalWhtMinor.toString(),
    version: s.version,
    postedAt: s.postedAt?.toISOString() ?? null,
  });
  d.vouchers = vouchers.map(toVoucherDto);
  return d;
}

function toCertificateDto(c: WhtCertificateSnapshot): CertificateResponseDto {
  const d = new CertificateResponseDto();
  Object.assign(d, {
    id: c.id,
    number: c.number,
    voucherId: c.voucherId,
    pndForm: c.pndForm,
    vendorId: c.vendorId,
    vendorName: c.vendorName,
    vendorTaxId: c.vendorTaxId,
    paymentDate: c.paymentDate,
    totalBaseMinor: c.totalBaseMinor.toString(),
    totalTaxMinor: c.totalTaxMinor.toString(),
    isVoid: c.isVoid,
    lines: c.lines.map((l) => ({
      lineNo: l.lineNo,
      taxCode: l.taxCode,
      incomeType: l.incomeType,
      rateBp: l.rateBp,
      baseMinor: l.baseMinor.toString(),
      taxMinor: l.taxMinor.toString(),
    })),
  });
  return d;
}

// ---- controllers -----------------------------------------------------------

@ApiTags('finance-ap')
@ApiBearerAuth()
@Controller('vendor-invoices')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class VendorInvoiceController {
  constructor(
    private readonly createInvoice: CreateVendorInvoiceUseCase,
    private readonly postInvoice: PostVendorInvoiceUseCase,
    private readonly voidInvoice: VoidVendorInvoiceUseCase,
    private readonly getInvoice: GetVendorInvoiceUseCase,
    private readonly listInvoices: ListVendorInvoicesUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'VendorInvoice'))
  async list(
    @Query() q: ListVendorInvoicesQueryDto,
  ): Promise<VendorInvoiceListResponseDto> {
    const r = await this.listInvoices.execute({
      status: q.status ?? null,
      vendorId: q.vendorId ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new VendorInvoiceListResponseDto();
    dto.items = r.items.map(toInvoiceDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'VendorInvoice'))
  async find(@Param('id') id: string): Promise<VendorInvoiceResponseDto> {
    return toInvoiceDto(await this.getInvoice.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Capture a vendor invoice; three-way match against PO + receipts (T-340)',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'VendorInvoice'))
  async create(
    @Body() body: CreateVendorInvoiceRequestDto,
  ): Promise<VendorInvoiceResponseDto> {
    return toInvoiceDto(
      await this.createInvoice.execute({
        companyId: body.companyId ?? null,
        vendorId: body.vendorId ?? null,
        vendorInvoiceNumber: body.vendorInvoiceNumber,
        purchaseOrderId: body.purchaseOrderId ?? null,
        invoiceDate: body.invoiceDate ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        currency: body.currency ?? null,
        notes: body.notes ?? null,
        priceToleranceBp: body.priceToleranceBp ?? null,
        lines: body.lines
          ? body.lines.map((l) => ({
              purchaseOrderLineId: l.purchaseOrderLineId ?? null,
              itemId: l.itemId ?? null,
              quantity: BigInt(l.quantity),
              unitPriceMinor:
                l.unitPriceMinor === undefined
                  ? null
                  : BigInt(l.unitPriceMinor),
              description: l.description ?? null,
              discountBp: l.discountBp,
              whtTaxCodeId: l.whtTaxCodeId ?? null,
            }))
          : null,
      }),
    );
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'DRAFT -> OPEN; a variance needs acceptVariance=true',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'VendorInvoice'))
  async post(
    @Param('id') id: string,
    @Body() body: VendorInvoiceActionRequestDto,
  ): Promise<VendorInvoiceResponseDto> {
    return toInvoiceDto(
      await this.postInvoice.execute({
        invoiceId: id,
        expectedVersion: body.expectedVersion ?? null,
        acceptVariance: body.acceptVariance ?? false,
      }),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'VendorInvoice'))
  async voidEndpoint(
    @Param('id') id: string,
    @Body() body: VendorInvoiceActionRequestDto,
  ): Promise<VendorInvoiceResponseDto> {
    return toInvoiceDto(
      await this.voidInvoice.execute({
        invoiceId: id,
        expectedVersion: body.expectedVersion ?? null,
        reason: body.reason ?? null,
      }),
    );
  }
}

@ApiTags('finance-ap')
@ApiBearerAuth()
@Controller('payment-vouchers')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PaymentVoucherController {
  constructor(
    private readonly createVoucher: CreatePaymentVoucherUseCase,
    private readonly postVoucher: PostPaymentVoucherUseCase,
    private readonly voidVoucher: VoidPaymentVoucherUseCase,
    private readonly getVoucher: GetPaymentVoucherUseCase,
    private readonly listVouchers: ListPaymentVouchersUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'PaymentVoucher'))
  async list(
    @Query() q: ListVouchersQueryDto,
  ): Promise<VoucherListResponseDto> {
    const r = await this.listVouchers.execute({
      status: q.status ?? null,
      vendorId: q.vendorId ?? null,
      batchId: q.batchId ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new VoucherListResponseDto();
    dto.items = r.items.map(toVoucherDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'PaymentVoucher'))
  async find(@Param('id') id: string): Promise<VoucherResponseDto> {
    return toVoucherDto(await this.getVoucher.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Draft a voucher; WHT is computed from the invoices (T-341). Omit allocations to pay everything due.',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'PaymentVoucher'))
  async create(
    @Body() body: CreateVoucherRequestDto,
  ): Promise<VoucherResponseDto> {
    return toVoucherDto(
      await this.createVoucher.execute({
        companyId: body.companyId,
        vendorId: body.vendorId,
        method: body.method,
        paymentDate: body.paymentDate ?? null,
        currency: body.currency ?? null,
        reference: body.reference ?? null,
        chequeNumber: body.chequeNumber ?? null,
        chequeBank: body.chequeBank ?? null,
        chequeDate: body.chequeDate ?? null,
        notes: body.notes ?? null,
        allocations: body.allocations
          ? body.allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amountMinor:
                a.amountMinor === undefined ? null : BigInt(a.amountMinor),
            }))
          : null,
      }),
    );
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Settle the invoices and issue the WHT certificate (T-342)',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'PaymentVoucher'))
  async post(
    @Param('id') id: string,
    @Body() body: ActionRequestDto,
  ): Promise<VoucherResponseDto> {
    return toVoucherDto(
      await this.postVoucher.execute({
        voucherId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'PaymentVoucher'))
  async voidEndpoint(
    @Param('id') id: string,
    @Body() body: ActionRequestDto,
  ): Promise<VoucherResponseDto> {
    return toVoucherDto(
      await this.voidVoucher.execute({
        voucherId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }
}

@ApiTags('finance-ap')
@ApiBearerAuth()
@Controller('payment-batches')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PaymentBatchController {
  constructor(
    private readonly createBatch: CreatePaymentBatchUseCase,
    private readonly postBatch: PostPaymentBatchUseCase,
    private readonly voidBatch: VoidPaymentBatchUseCase,
    private readonly getBatch: GetPaymentBatchUseCase,
  ) {}

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'PaymentVoucher'))
  async find(@Param('id') id: string): Promise<BatchResponseDto> {
    const r = await this.getBatch.execute(id);
    return toBatchDto(r.batch, r.vouchers);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Group vouchers, or generate one per vendor for everything due (T-344)',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'PaymentVoucher'))
  async create(@Body() body: CreateBatchRequestDto): Promise<BatchResponseDto> {
    const r = await this.createBatch.execute({
      companyId: body.companyId,
      method: body.method,
      paymentDate: body.paymentDate ?? null,
      currency: body.currency ?? null,
      voucherIds: body.voucherIds ?? null,
      vendorIds: body.vendorIds ?? null,
    });
    return toBatchDto(r.batch, r.vouchers);
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Submit, 'PaymentVoucher'))
  async post(
    @Param('id') id: string,
    @Body() body: ActionRequestDto,
  ): Promise<BatchResponseDto> {
    const b = await this.postBatch.execute({
      batchId: id,
      expectedVersion: body.expectedVersion ?? null,
    });
    const r = await this.getBatch.execute(b.id);
    return toBatchDto(r.batch, r.vouchers);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'PaymentVoucher'))
  async voidEndpoint(
    @Param('id') id: string,
    @Body() body: ActionRequestDto,
  ): Promise<BatchResponseDto> {
    const b = await this.voidBatch.execute({
      batchId: id,
      expectedVersion: body.expectedVersion ?? null,
    });
    const r = await this.getBatch.execute(b.id);
    return toBatchDto(r.batch, r.vouchers);
  }
}

@ApiTags('finance-ap')
@ApiBearerAuth()
@Controller('wht-certificates')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class WhtCertificateController {
  constructor(
    private readonly getCertificate: GetWhtCertificateUseCase,
    private readonly listCertificates: ListWhtCertificatesUseCase,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'PaymentVoucher'))
  async list(
    @Query() q: ListCertificatesQueryDto,
  ): Promise<CertificateListResponseDto> {
    const r = await this.listCertificates.execute({
      vendorId: q.vendorId ?? null,
      from: q.from ?? null,
      to: q.to ?? null,
      limit: q.limit,
      offset: q.offset,
    });
    const dto = new CertificateListResponseDto();
    dto.items = r.items.map(toCertificateDto);
    dto.total = r.total;
    dto.limit = r.limit;
    dto.offset = r.offset;
    return dto;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'PaymentVoucher'))
  async find(@Param('id') id: string): Promise<CertificateResponseDto> {
    return toCertificateDto(await this.getCertificate.execute(id));
  }
}

@ApiTags('finance-ap')
@ApiBearerAuth()
@Controller('ap')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ApReportController {
  constructor(
    private readonly aging: ApAgingUseCase,
    private readonly forecast: CashForecastUseCase,
  ) {}

  @Get('aging')
  @ApiOperation({ summary: 'AP aging per vendor (T-345)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'VendorInvoice'))
  async agingReport(@Query() q: ApAgingQueryDto): Promise<ApAgingResponseDto> {
    const r = await this.aging.execute({
      asOf: q.asOf ?? null,
      vendorId: q.vendorId ?? null,
    });
    const dto = new ApAgingResponseDto();
    dto.asOf = r.asOf;
    dto.totalMinor = r.totalMinor.toString();
    dto.rows = r.rows.map((row) => ({
      vendorId: row.partyId,
      buckets: Object.fromEntries(
        Object.entries(row.buckets).map(([k, v]) => [k, v.toString()]),
      ),
      totalMinor: row.totalMinor.toString(),
      openInvoices: row.openDocuments,
    }));
    return dto;
  }

  @Get('cash-forecast')
  @ApiOperation({ summary: 'Open payables by due week (T-345)' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'VendorInvoice'))
  async cashForecast(
    @Query() q: CashForecastQueryDto,
  ): Promise<CashForecastResponseDto> {
    const r = await this.forecast.execute({
      asOf: q.asOf ?? null,
      weeks: q.weeks ?? null,
    });
    const dto = new CashForecastResponseDto();
    dto.asOf = r.asOf;
    dto.totalMinor = r.totalMinor.toString();
    dto.buckets = r.buckets.map((b) => ({
      label: b.label,
      from: b.from,
      to: b.to,
      amountMinor: b.amountMinor.toString(),
      invoices: b.invoices,
    }));
    return dto;
  }
}
