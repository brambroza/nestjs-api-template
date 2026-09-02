BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[inv_count] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [notes] NVARCHAR(max),
    [approvalRequestId] NVARCHAR(36),
    [version] INT NOT NULL CONSTRAINT [inv_count_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [countedAt] DATETIME2,
    [postedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_count_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_count_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [inv_count_tenantId_warehouseId_status_idx] ON [dbo].[inv_count] ([tenantId], [warehouseId], [status]);

CREATE TABLE [dbo].[inv_count_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [countId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [lotId] NVARCHAR(36),
    [lotNumber] NVARCHAR(64),
    [uomCode] NVARCHAR(16) NOT NULL,
    [systemQty] BIGINT NOT NULL,
    [countedQty] BIGINT,
    [varianceQty] BIGINT NOT NULL CONSTRAINT [inv_count_line_varianceQty_df] DEFAULT 0,
    [unitCostMinor] BIGINT NOT NULL CONSTRAINT [inv_count_line_unitCostMinor_df] DEFAULT 0,
    CONSTRAINT [inv_count_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_count_line_countId_lineNo_key] UNIQUE NONCLUSTERED ([countId], [lineNo])
);

CREATE TABLE [dbo].[pur_reorder_rule] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [reorderPoint] BIGINT NOT NULL,
    [reorderQty] BIGINT NOT NULL,
    [preferredVendorId] NVARCHAR(36),
    [isActive] BIT NOT NULL CONSTRAINT [pur_reorder_rule_isActive_df] DEFAULT 1,
    [lastTriggeredAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [pur_reorder_rule_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_reorder_rule_tenantId_warehouseId_itemId_key] UNIQUE NONCLUSTERED ([tenantId], [warehouseId], [itemId])
);
CREATE NONCLUSTERED INDEX [pur_reorder_rule_tenantId_isActive_idx] ON [dbo].[pur_reorder_rule] ([tenantId], [isActive]);

ALTER TABLE [dbo].[inv_count] ADD CONSTRAINT [inv_count_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_count_line] ADD CONSTRAINT [inv_count_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_count_line] ADD CONSTRAINT [inv_count_line_countId_fkey] FOREIGN KEY ([countId]) REFERENCES [dbo].[inv_count]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_reorder_rule] ADD CONSTRAINT [pur_reorder_rule_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
