BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[sls_order] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [quotationId] NVARCHAR(36),
    [customerId] NVARCHAR(36) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [orderDate] DATE NOT NULL,
    [requestedDeliveryDate] DATE,
    [status] NVARCHAR(20) NOT NULL,
    [paymentTermsDays] INT NOT NULL,
    [notes] NVARCHAR(max),
    [subtotalMinor] BIGINT NOT NULL,
    [discountMinor] BIGINT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [creditStatus] NVARCHAR(12) NOT NULL CONSTRAINT [sls_order_creditStatus_df] DEFAULT 'NOT_CHECKED',
    [creditExposureMinor] BIGINT NOT NULL CONSTRAINT [sls_order_creditExposureMinor_df] DEFAULT 0,
    [approvalRequestId] NVARCHAR(36),
    [version] INT NOT NULL CONSTRAINT [sls_order_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [submittedAt] DATETIME2,
    [confirmedAt] DATETIME2,
    [resolvedAt] DATETIME2,
    [cancelReason] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [sls_order_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sls_order_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [sls_order_tenantId_customerId_status_idx]
    ON [dbo].[sls_order] ([tenantId], [customerId], [status]);
CREATE NONCLUSTERED INDEX [sls_order_tenantId_status_idx]
    ON [dbo].[sls_order] ([tenantId], [status]);

CREATE TABLE [dbo].[sls_order_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [salesOrderId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [description] NVARCHAR(200) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [deliveredQty] BIGINT NOT NULL CONSTRAINT [sls_order_line_deliveredQty_df] DEFAULT 0,
    [unitPriceMinor] BIGINT NOT NULL,
    [priceSource] NVARCHAR(12) NOT NULL,
    [priceListId] NVARCHAR(36),
    [discountBp] INT NOT NULL CONSTRAINT [sls_order_line_discountBp_df] DEFAULT 0,
    [discountMinor] BIGINT NOT NULL,
    [netMinor] BIGINT NOT NULL,
    [taxCodeId] NVARCHAR(36) NOT NULL,
    [taxCode] NVARCHAR(16) NOT NULL,
    [taxRateBp] INT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    CONSTRAINT [sls_order_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sls_order_line_salesOrderId_lineNo_key] UNIQUE NONCLUSTERED ([salesOrderId], [lineNo])
);
CREATE NONCLUSTERED INDEX [sls_order_line_tenantId_itemId_idx]
    ON [dbo].[sls_order_line] ([tenantId], [itemId]);

CREATE TABLE [dbo].[sls_delivery_note] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [salesOrderId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [deliveryDate] DATE NOT NULL,
    [warehouseId] NVARCHAR(36),
    [shipToAddress] NVARCHAR(500),
    [notes] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [sls_delivery_note_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [shippedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [sls_delivery_note_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sls_delivery_note_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [sls_delivery_note_tenantId_salesOrderId_idx]
    ON [dbo].[sls_delivery_note] ([tenantId], [salesOrderId]);

CREATE TABLE [dbo].[sls_delivery_note_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [deliveryNoteId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [salesOrderLineId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    CONSTRAINT [sls_delivery_note_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sls_delivery_note_line_deliveryNoteId_lineNo_key] UNIQUE NONCLUSTERED ([deliveryNoteId], [lineNo])
);
CREATE NONCLUSTERED INDEX [sls_delivery_note_line_tenantId_salesOrderLineId_idx]
    ON [dbo].[sls_delivery_note_line] ([tenantId], [salesOrderLineId]);

ALTER TABLE [dbo].[sls_order] ADD CONSTRAINT [sls_order_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_order_line] ADD CONSTRAINT [sls_order_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_order_line] ADD CONSTRAINT [sls_order_line_salesOrderId_fkey]
    FOREIGN KEY ([salesOrderId]) REFERENCES [dbo].[sls_order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_delivery_note] ADD CONSTRAINT [sls_delivery_note_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_delivery_note] ADD CONSTRAINT [sls_delivery_note_salesOrderId_fkey]
    FOREIGN KEY ([salesOrderId]) REFERENCES [dbo].[sls_order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_delivery_note_line] ADD CONSTRAINT [sls_delivery_note_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_delivery_note_line] ADD CONSTRAINT [sls_delivery_note_line_deliveryNoteId_fkey]
    FOREIGN KEY ([deliveryNoteId]) REFERENCES [dbo].[sls_delivery_note]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
