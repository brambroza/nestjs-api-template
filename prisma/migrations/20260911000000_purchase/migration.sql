BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[pur_requisition] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [requesterId] NVARCHAR(64) NOT NULL,
    [neededByDate] DATE,
    [purpose] NVARCHAR(500),
    [status] NVARCHAR(20) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [estimatedTotalMinor] BIGINT NOT NULL,
    [approvalRequestId] NVARCHAR(36),
    [purchaseOrderId] NVARCHAR(36),
    [version] INT NOT NULL CONSTRAINT [pur_requisition_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [submittedAt] DATETIME2,
    [resolvedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [pur_requisition_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_requisition_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [pur_requisition_tenantId_status_idx]
    ON [dbo].[pur_requisition] ([tenantId], [status]);
CREATE NONCLUSTERED INDEX [pur_requisition_tenantId_requesterId_idx]
    ON [dbo].[pur_requisition] ([tenantId], [requesterId]);

CREATE TABLE [dbo].[pur_requisition_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [requisitionId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [description] NVARCHAR(200) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [estimatedUnitPriceMinor] BIGINT NOT NULL CONSTRAINT [pur_requisition_line_estimatedUnitPriceMinor_df] DEFAULT 0,
    [estimatedTotalMinor] BIGINT NOT NULL CONSTRAINT [pur_requisition_line_estimatedTotalMinor_df] DEFAULT 0,
    [suggestedVendorId] NVARCHAR(36),
    CONSTRAINT [pur_requisition_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_requisition_line_requisitionId_lineNo_key] UNIQUE NONCLUSTERED ([requisitionId], [lineNo])
);
CREATE NONCLUSTERED INDEX [pur_requisition_line_tenantId_itemId_idx]
    ON [dbo].[pur_requisition_line] ([tenantId], [itemId]);

CREATE TABLE [dbo].[pur_order] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [requisitionId] NVARCHAR(36),
    [vendorId] NVARCHAR(36) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [orderDate] DATE NOT NULL,
    [expectedDate] DATE,
    [status] NVARCHAR(20) NOT NULL,
    [paymentTermsDays] INT NOT NULL,
    [notes] NVARCHAR(max),
    [subtotalMinor] BIGINT NOT NULL,
    [discountMinor] BIGINT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [approvalRequestId] NVARCHAR(36),
    [version] INT NOT NULL CONSTRAINT [pur_order_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [submittedAt] DATETIME2,
    [issuedAt] DATETIME2,
    [resolvedAt] DATETIME2,
    [cancelReason] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [pur_order_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_order_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [pur_order_tenantId_vendorId_status_idx]
    ON [dbo].[pur_order] ([tenantId], [vendorId], [status]);
CREATE NONCLUSTERED INDEX [pur_order_tenantId_status_idx]
    ON [dbo].[pur_order] ([tenantId], [status]);

CREATE TABLE [dbo].[pur_order_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [purchaseOrderId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [description] NVARCHAR(200) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [receivedQty] BIGINT NOT NULL CONSTRAINT [pur_order_line_receivedQty_df] DEFAULT 0,
    [unitPriceMinor] BIGINT NOT NULL,
    [priceSource] NVARCHAR(12) NOT NULL,
    [priceListId] NVARCHAR(36),
    [discountBp] INT NOT NULL CONSTRAINT [pur_order_line_discountBp_df] DEFAULT 0,
    [discountMinor] BIGINT NOT NULL,
    [netMinor] BIGINT NOT NULL,
    [taxCodeId] NVARCHAR(36) NOT NULL,
    [taxCode] NVARCHAR(16) NOT NULL,
    [taxRateBp] INT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    CONSTRAINT [pur_order_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_order_line_purchaseOrderId_lineNo_key] UNIQUE NONCLUSTERED ([purchaseOrderId], [lineNo])
);
CREATE NONCLUSTERED INDEX [pur_order_line_tenantId_itemId_idx]
    ON [dbo].[pur_order_line] ([tenantId], [itemId]);

CREATE TABLE [dbo].[pur_goods_receipt] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [purchaseOrderId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [receiptDate] DATE NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [vendorDeliveryRef] NVARCHAR(64),
    [notes] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [pur_goods_receipt_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [postedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [pur_goods_receipt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_goods_receipt_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [pur_goods_receipt_tenantId_purchaseOrderId_idx]
    ON [dbo].[pur_goods_receipt] ([tenantId], [purchaseOrderId]);

CREATE TABLE [dbo].[pur_goods_receipt_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [goodsReceiptId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [purchaseOrderLineId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [lotNumber] NVARCHAR(64),
    [expiryDate] DATE,
    CONSTRAINT [pur_goods_receipt_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pur_goods_receipt_line_goodsReceiptId_lineNo_key] UNIQUE NONCLUSTERED ([goodsReceiptId], [lineNo])
);
CREATE NONCLUSTERED INDEX [pur_goods_receipt_line_tenantId_purchaseOrderLineId_idx]
    ON [dbo].[pur_goods_receipt_line] ([tenantId], [purchaseOrderLineId]);

ALTER TABLE [dbo].[pur_requisition] ADD CONSTRAINT [pur_requisition_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_requisition_line] ADD CONSTRAINT [pur_requisition_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_requisition_line] ADD CONSTRAINT [pur_requisition_line_requisitionId_fkey]
    FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[pur_requisition]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_order] ADD CONSTRAINT [pur_order_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_order_line] ADD CONSTRAINT [pur_order_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_order_line] ADD CONSTRAINT [pur_order_line_purchaseOrderId_fkey]
    FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[pur_order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_goods_receipt] ADD CONSTRAINT [pur_goods_receipt_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_goods_receipt] ADD CONSTRAINT [pur_goods_receipt_purchaseOrderId_fkey]
    FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[pur_order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_goods_receipt_line] ADD CONSTRAINT [pur_goods_receipt_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pur_goods_receipt_line] ADD CONSTRAINT [pur_goods_receipt_line_goodsReceiptId_fkey]
    FOREIGN KEY ([goodsReceiptId]) REFERENCES [dbo].[pur_goods_receipt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
