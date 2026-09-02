BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[tenant] (
    [id] NVARCHAR(36) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [dualApprovalThresholdSatang] BIGINT NOT NULL,
    [overToleranceBasisPoints] BIGINT NOT NULL,
    [underToleranceBasisPoints] BIGINT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tenant_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [tenant_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[tenant_calendar] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [date] DATE NOT NULL,
    [isWorkingDay] BIT NOT NULL,
    [note] NVARCHAR(200),
    CONSTRAINT [tenant_calendar_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tenant_calendar_tenantId_date_key] UNIQUE NONCLUSTERED ([tenantId],[date])
);

-- CreateTable
CREATE TABLE [dbo].[production_order] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [createdBy] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(24) NOT NULL,
    [orderedQuantityValue] BIGINT NOT NULL,
    [orderedQuantityUom] NVARCHAR(16) NOT NULL,
    [totalAmountSatang] BIGINT NOT NULL,
    [totalAmountCurrency] NVARCHAR(3) NOT NULL,
    [firstApprover] NVARCHAR(64),
    [secondApprover] NVARCHAR(64),
    [producedQuantityValue] BIGINT NOT NULL,
    [producedQuantityUom] NVARCHAR(16) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [production_order_version_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [production_order_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[progress_report] (
    [id] NVARCHAR(36) NOT NULL,
    [productionOrderId] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [quantityValue] BIGINT NOT NULL,
    [quantityUom] NVARCHAR(16) NOT NULL,
    [reportedBy] NVARCHAR(64) NOT NULL,
    [reportedAt] DATETIME2 NOT NULL,
    CONSTRAINT [progress_report_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[bom_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [productionOrderId] NVARCHAR(36) NOT NULL,
    [sku] NVARCHAR(64) NOT NULL,
    [requiredPerUnitValue] BIGINT NOT NULL,
    [requiredPerUnitUom] NVARCHAR(16) NOT NULL,
    [scrapBasisPoints] BIGINT NOT NULL,
    [yieldBasisPoints] BIGINT NOT NULL,
    [minPackValue] BIGINT NOT NULL,
    [minPackUom] NVARCHAR(16) NOT NULL,
    CONSTRAINT [bom_line_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[stock_level] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [sku] NVARCHAR(64) NOT NULL,
    [onHandValue] BIGINT NOT NULL,
    [onHandUom] NVARCHAR(16) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [stock_level_version_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [stock_level_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [stock_level_tenantId_sku_key] UNIQUE NONCLUSTERED ([tenantId],[sku])
);

-- CreateTable
CREATE TABLE [dbo].[outbox_message] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [aggregateType] NVARCHAR(64) NOT NULL,
    [aggregateId] NVARCHAR(64) NOT NULL,
    [eventType] NVARCHAR(128) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [occurredAt] DATETIME2 NOT NULL,
    [status] NVARCHAR(16) NOT NULL,
    [attempts] INT NOT NULL CONSTRAINT [outbox_message_attempts_df] DEFAULT 0,
    [nextAttemptAt] DATETIME2 NOT NULL,
    [lastError] NVARCHAR(1024),
    [idempotencyKey] NVARCHAR(128) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [outbox_message_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [outbox_message_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [outbox_message_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [tenant_calendar_tenantId_date_idx] ON [dbo].[tenant_calendar]([tenantId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [production_order_tenantId_status_idx] ON [dbo].[production_order]([tenantId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [production_order_tenantId_createdAt_idx] ON [dbo].[production_order]([tenantId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [progress_report_tenantId_productionOrderId_idx] ON [dbo].[progress_report]([tenantId], [productionOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [progress_report_tenantId_reportedAt_idx] ON [dbo].[progress_report]([tenantId], [reportedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [bom_line_tenantId_productionOrderId_idx] ON [dbo].[bom_line]([tenantId], [productionOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [outbox_message_status_nextAttemptAt_idx] ON [dbo].[outbox_message]([status], [nextAttemptAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [outbox_message_tenantId_aggregateId_idx] ON [dbo].[outbox_message]([tenantId], [aggregateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [outbox_message_tenantId_aggregateId_occurredAt_idx] ON [dbo].[outbox_message]([tenantId], [aggregateId], [occurredAt]);

-- AddForeignKey
ALTER TABLE [dbo].[tenant_calendar] ADD CONSTRAINT [tenant_calendar_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[production_order] ADD CONSTRAINT [production_order_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[progress_report] ADD CONSTRAINT [progress_report_productionOrderId_fkey] FOREIGN KEY ([productionOrderId]) REFERENCES [dbo].[production_order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[progress_report] ADD CONSTRAINT [progress_report_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[bom_line] ADD CONSTRAINT [bom_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[bom_line] ADD CONSTRAINT [bom_line_productionOrderId_fkey] FOREIGN KEY ([productionOrderId]) REFERENCES [dbo].[production_order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[stock_level] ADD CONSTRAINT [stock_level_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[outbox_message] ADD CONSTRAINT [outbox_message_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

