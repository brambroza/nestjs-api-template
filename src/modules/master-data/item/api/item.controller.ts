import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../../shared/auth';
import {
  Action,
  CheckPolicies,
  PoliciesGuard,
} from '../../../../shared/auth/policies';
import {
  CreateItemUseCase,
  GetItemUseCase,
  ITEM_IMPORT_PARSER,
  ImportItemsUseCase,
  ListItemsUseCase,
  type ItemImportRowsParser,
} from '../application';

import {
  CreateItemRequestDto,
  ImportItemsQueryDto,
  ImportItemsResponseDto,
  ItemResponseDto,
  ListItemsQueryDto,
  ListItemsResponseDto,
  toImportItemsResponseDto,
  toItemResponseDto,
} from './dto';

/** 10 MB is ~100k rows of typical item data; the row cap bites first. */
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ItemController {
  constructor(
    private readonly createItem: CreateItemUseCase,
    private readonly getItem: GetItemUseCase,
    private readonly listItems: ListItemsUseCase,
    private readonly importItems: ImportItemsUseCase,
    @Inject(ITEM_IMPORT_PARSER) private readonly parser: ItemImportRowsParser,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Item'))
  async list(@Query() query: ListItemsQueryDto): Promise<ListItemsResponseDto> {
    const result = await this.listItems.execute({
      limit: query.limit,
      offset: query.offset,
      activeOnly: query.activeOnly,
    });
    const dto = new ListItemsResponseDto();
    dto.items = result.items.map(toItemResponseDto);
    dto.total = result.total;
    dto.limit = result.limit;
    dto.offset = result.offset;
    return dto;
  }

  /**
   * Declared before `:id` so Express never treats "import" as an id.
   * Always 200: the report is the result of the operation, and a
   * REJECTED outcome is a normal, expected answer for a bad sheet.
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Bulk import items from .xlsx (<=10k rows). All-or-nothing unless allowPartial=true; dryRun=true validates only.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @CheckPolicies((ability) => ability.can(Action.Create, 'Item'))
  async importFromXlsx(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: ImportItemsQueryDto,
  ): Promise<ImportItemsResponseDto> {
    if (!file) {
      throw new BadRequestException('multipart field "file" is required');
    }
    const rows = await this.parser.parse(file.buffer);
    const report = await this.importItems.execute({
      rows,
      dryRun: query.dryRun ?? false,
      allowPartial: query.allowPartial ?? false,
    });
    return toImportItemsResponseDto(report);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Item'))
  async find(@Param('id') id: string): Promise<ItemResponseDto> {
    return toItemResponseDto(await this.getItem.execute(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can(Action.Create, 'Item'))
  async create(@Body() body: CreateItemRequestDto): Promise<ItemResponseDto> {
    const item = await this.createItem.execute({
      sku: body.sku,
      name: body.name,
      description: body.description ?? null,
      defaultUomCode: body.defaultUomCode,
      categoryId: body.categoryId ?? null,
      trackingPolicy: body.trackingPolicy,
      shelfLifeDays: body.shelfLifeDays ?? null,
    });
    return toItemResponseDto(item);
  }
}
