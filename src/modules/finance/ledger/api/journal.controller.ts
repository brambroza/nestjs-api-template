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
import {
  CreateJournalEntryUseCase,
  GetJournalEntryUseCase,
  ListJournalEntriesUseCase,
  PostJournalEntryUseCase,
  ReverseJournalEntryUseCase,
  SubmitJournalEntryUseCase,
  VoidJournalEntryUseCase,
} from '../application';
import {
  JournalEntryStatus,
  JournalSourceType,
  MAX_JOURNAL_LINES,
  type JournalEntry,
} from '../domain';

const INT = /^\d{1,19}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class JournalLineRequestDto {
  @Expose() @IsOptional() @IsString() @Length(1, 36) accountId?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) accountCode?: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) debitMinor?: string;
  @Expose() @IsOptional() @IsString() @Matches(INT) creditMinor?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 200) description?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 16) partyType?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) partyId?: string;
}

export class CreateJournalEntryRequestDto {
  @Expose() @IsString() @Length(1, 36) companyId!: string;
  @Expose() @IsString() @Matches(ISO_DATE) entryDate!: string;
  @Expose() @IsString() @Length(1, 500) description!: string;
  @Expose()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
  @Expose()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_JOURNAL_LINES)
  @ValidateNested({ each: true })
  @Type(() => JournalLineRequestDto)
  lines!: JournalLineRequestDto[];
}

export class JournalActionRequestDto {
  @Expose() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

export class ReverseJournalRequestDto extends JournalActionRequestDto {
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) entryDate?: string;
  @Expose() @IsOptional() @IsString() @Length(0, 500) description?: string;
}

export class JournalListQueryDto {
  @Expose() @IsOptional() @IsString() @Length(1, 36) companyId?: string;
  @Expose()
  @IsOptional()
  @IsIn(Object.values(JournalEntryStatus))
  status?: string;
  @Expose()
  @IsOptional()
  @IsIn(Object.values(JournalSourceType))
  sourceType?: string;
  @Expose() @IsOptional() @IsString() @Length(1, 36) accountId?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) from?: string;
  @Expose() @IsOptional() @IsString() @Matches(ISO_DATE) to?: string;
  @Expose()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @Expose() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class JournalLineResponseDto {
  @Expose() id!: string;
  @Expose() lineNo!: number;
  @Expose() accountId!: string;
  @Expose() accountCode!: string;
  @Expose() debitMinor!: string;
  @Expose() creditMinor!: string;
  @Expose() description!: string | null;
  @Expose() partyType!: string | null;
  @Expose() partyId!: string | null;
}

export class JournalEntryResponseDto {
  @Expose() id!: string;
  @Expose() companyId!: string;
  @Expose() number!: string;
  @Expose() entryDate!: string;
  @Expose() description!: string;
  @Expose() sourceType!: string;
  @Expose() sourceId!: string | null;
  @Expose() currency!: string;
  @Expose() status!: string;
  @Expose() reversalOfId!: string | null;
  @Expose() reversedById!: string | null;
  @Expose() approvalRequestId!: string | null;
  @Expose() totalDebitMinor!: string;
  @Expose() totalCreditMinor!: string;
  @Expose() version!: number;
  @Expose() createdBy!: string;
  @Expose() postedAt!: string | null;
  @Expose() postedBy!: string | null;
  @Expose() voidedAt!: string | null;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
  @Expose()
  @Type(() => JournalLineResponseDto)
  lines!: JournalLineResponseDto[];

  static from(e: JournalEntry): JournalEntryResponseDto {
    const s = e.snapshot();
    const dto = new JournalEntryResponseDto();
    dto.id = s.id;
    dto.companyId = s.companyId;
    dto.number = s.number;
    dto.entryDate = s.entryDate;
    dto.description = s.description;
    dto.sourceType = s.sourceType;
    dto.sourceId = s.sourceId;
    dto.currency = s.currency;
    dto.status = s.status;
    dto.reversalOfId = s.reversalOfId;
    dto.reversedById = s.reversedById;
    dto.approvalRequestId = s.approvalRequestId;
    dto.totalDebitMinor = s.totalDebitMinor.toString();
    dto.totalCreditMinor = s.totalCreditMinor.toString();
    dto.version = s.version;
    dto.createdBy = s.createdBy;
    dto.postedAt = s.postedAt?.toISOString() ?? null;
    dto.postedBy = s.postedBy;
    dto.voidedAt = s.voidedAt?.toISOString() ?? null;
    dto.createdAt = s.createdAt.toISOString();
    dto.updatedAt = s.updatedAt.toISOString();
    dto.lines = s.lines.map((l) => {
      const line = new JournalLineResponseDto();
      line.id = l.id;
      line.lineNo = l.lineNo;
      line.accountId = l.accountId;
      line.accountCode = l.accountCode;
      line.debitMinor = l.debitMinor.toString();
      line.creditMinor = l.creditMinor.toString();
      line.description = l.description;
      line.partyType = l.partyType;
      line.partyId = l.partyId;
      return line;
    });
    return dto;
  }
}

export class JournalListResponseDto {
  @Expose()
  @Type(() => JournalEntryResponseDto)
  items!: JournalEntryResponseDto[];
  @Expose() total!: number;
}

function toStatus(v: string | undefined): JournalEntryStatus | null {
  return v && (Object.values(JournalEntryStatus) as string[]).includes(v)
    ? (v as JournalEntryStatus)
    : null;
}
function toSource(v: string | undefined): JournalSourceType | null {
  return v && (Object.values(JournalSourceType) as string[]).includes(v)
    ? (v as JournalSourceType)
    : null;
}

@ApiTags('finance-gl')
@ApiBearerAuth()
@Controller('journal-entries')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class JournalController {
  constructor(
    private readonly create: CreateJournalEntryUseCase,
    private readonly submit: SubmitJournalEntryUseCase,
    private readonly post: PostJournalEntryUseCase,
    private readonly voidEntry: VoidJournalEntryUseCase,
    private readonly reverse: ReverseJournalEntryUseCase,
    private readonly get: GetJournalEntryUseCase,
    private readonly list: ListJournalEntriesUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual journal voucher (T-350)' })
  @CheckPolicies((ability) => ability.can(Action.Create, 'JournalEntry'))
  async createEntry(
    @Body() body: CreateJournalEntryRequestDto,
  ): Promise<JournalEntryResponseDto> {
    const e = await this.create.execute({
      companyId: body.companyId,
      entryDate: body.entryDate,
      description: body.description,
      currency: body.currency ?? null,
      lines: body.lines.map((l) => ({
        accountId: l.accountId ?? null,
        accountCode: l.accountCode ?? null,
        debitMinor: BigInt(l.debitMinor ?? '0'),
        creditMinor: BigInt(l.creditMinor ?? '0'),
        description: l.description ?? null,
        partyType: l.partyType ?? null,
        partyId: l.partyId ?? null,
      })),
    });
    return JournalEntryResponseDto.from(e);
  }

  @Get()
  @ApiOperation({ summary: 'List journal entries' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'JournalEntry'))
  async listEntries(
    @Query() q: JournalListQueryDto,
  ): Promise<JournalListResponseDto> {
    const r = await this.list.execute({
      companyId: q.companyId ?? null,
      status: toStatus(q.status),
      sourceType: toSource(q.sourceType),
      accountId: q.accountId ?? null,
      from: q.from ?? null,
      to: q.to ?? null,
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
    });
    const dto = new JournalListResponseDto();
    dto.items = r.items.map((e) => JournalEntryResponseDto.from(e));
    dto.total = r.total;
    return dto;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a journal entry with its lines' })
  @CheckPolicies((ability) => ability.can(Action.Read, 'JournalEntry'))
  async getEntry(@Param('id') id: string): Promise<JournalEntryResponseDto> {
    return JournalEntryResponseDto.from(await this.get.execute(id));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit for approval (JOURNAL_ENTRY policy); posts at once when none applies',
  })
  @CheckPolicies((ability) => ability.can(Action.Submit, 'JournalEntry'))
  async submitEntry(
    @Param('id') id: string,
    @Body() body: JournalActionRequestDto,
  ): Promise<JournalEntryResponseDto> {
    return JournalEntryResponseDto.from(
      await this.submit.execute({
        entryId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post (pulls the approval decision when pending)' })
  @CheckPolicies((ability) => ability.can(Action.Update, 'JournalEntry'))
  async postEntry(
    @Param('id') id: string,
    @Body() body: JournalActionRequestDto,
  ): Promise<JournalEntryResponseDto> {
    return JournalEntryResponseDto.from(
      await this.post.execute({
        entryId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void a DRAFT / PENDING_APPROVAL entry' })
  @CheckPolicies((ability) => ability.can(Action.Cancel, 'JournalEntry'))
  async voidJournal(
    @Param('id') id: string,
    @Body() body: JournalActionRequestDto,
  ): Promise<JournalEntryResponseDto> {
    return JournalEntryResponseDto.from(
      await this.voidEntry.execute({
        entryId: id,
        expectedVersion: body.expectedVersion ?? null,
      }),
    );
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a POSTED entry with a mirror entry' })
  @CheckPolicies((ability) => ability.can(Action.Update, 'JournalEntry'))
  async reverseEntry(
    @Param('id') id: string,
    @Body() body: ReverseJournalRequestDto,
  ): Promise<JournalEntryResponseDto> {
    return JournalEntryResponseDto.from(
      await this.reverse.execute({
        entryId: id,
        expectedVersion: body.expectedVersion ?? null,
        entryDate: body.entryDate ?? null,
        description: body.description ?? null,
      }),
    );
  }
}
