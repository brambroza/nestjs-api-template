BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[tenant] ADD [costingMethod] NVARCHAR(16) NOT NULL CONSTRAINT [tenant_costingMethod_df] DEFAULT 'FIFO';

CREATE TABLE [dbo].[inv_lot] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [lotNumber] NVARCHAR(64) NOT NULL,
    [expiryDate] DATE,
    [createdAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_lot_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_lot_tenantId_itemId_lotNumber_key] UNIQUE NONCLUSTERED ([tenantId], [itemId], [lotNumber])
);
CREATE NONCLUSTERED INDEX [inv_lot_tenantId_expiryDate_idx] ON [dbo].[inv_lot] ([tenantId], [expiryDate]);

CREATE TABLE [dbo].[inv_serial] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [serialNumber] NVARCHAR(64) NOT NULL,
    [warehouseId] NVARCHAR(36),
    [lotId] NVARCHAR(36),
    [status] NVARCHAR(12) NOT NULL,
    [lastMovementId] NVARCHAR(36),
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_serial_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_serial_tenantId_itemId_serialNumber_key] UNIQUE NONCLUSTERED ([tenantId], [itemId], [serialNumber])
);
CREATE NONCLUSTERED INDEX [inv_serial_tenantId_serialNumber_idx] ON [dbo].[inv_serial] ([tenantId], [serialNumber]);

CREATE TABLE [dbo].[inv_stock_balance] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [lotId] NVARCHAR(36),
    [uomCode] NVARCHAR(16) NOT NULL,
    [onHandQty] BIGINT NOT NULL CONSTRAINT [inv_stock_balance_onHandQty_df] DEFAULT 0,
    [reservedQty] BIGINT NOT NULL CONSTRAINT [inv_stock_balance_reservedQty_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [inv_stock_balance_version_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_stock_balance_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_stock_balance_tenantId_warehouseId_itemId_lotId_key] UNIQUE NONCLUSTERED ([tenantId], [warehouseId], [itemId], [lotId])
);
CREATE NONCLUSTERED INDEX [inv_stock_balance_tenantId_itemId_idx] ON [dbo].[inv_stock_balance] ([tenantId], [itemId]);

CREATE TABLE [dbo].[inv_stock_movement] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [lotId] NVARCHAR(36),
    [uomCode] NVARCHAR(16) NOT NULL,
    [type] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [unitCostMinor] BIGINT NOT NULL CONSTRAINT [inv_stock_movement_unitCostMinor_df] DEFAULT 0,
    [costMinor] BIGINT NOT NULL CONSTRAINT [inv_stock_movement_costMinor_df] DEFAULT 0,
    [currency] NVARCHAR(3) NOT NULL,
    [referenceType] NVARCHAR(32) NOT NULL,
    [referenceId] NVARCHAR(36) NOT NULL,
    [reason] NVARCHAR(500),
    [serialNumbers] NVARCHAR(max),
    [occurredAt] DATETIME2 NOT NULL,
    [createdBy] NVARCHAR(64) NOT NULL,
    CONSTRAINT [inv_stock_movement_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [inv_stock_movement_tenantId_itemId_occurredAt_idx] ON [dbo].[inv_stock_movement] ([tenantId], [itemId], [occurredAt]);
CREATE NONCLUSTERED INDEX [inv_stock_movement_tenantId_warehouseId_occurredAt_idx] ON [dbo].[inv_stock_movement] ([tenantId], [warehouseId], [occurredAt]);
CREATE NONCLUSTERED INDEX [inv_stock_movement_tenantId_referenceType_referenceId_idx] ON [dbo].[inv_stock_movement] ([tenantId], [referenceType], [referenceId]);

CREATE TABLE [dbo].[inv_cost_layer] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [lotId] NVARCHAR(36),
    [movementId] NVARCHAR(36) NOT NULL,
    [receivedAt] DATETIME2 NOT NULL,
    [originalQty] BIGINT NOT NULL,
    [remainingQty] BIGINT NOT NULL,
    [unitCostMinor] BIGINT NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    CONSTRAINT [inv_cost_layer_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [inv_cost_layer_tenantId_warehouseId_itemId_receivedAt_idx] ON [dbo].[inv_cost_layer] ([tenantId], [warehouseId], [itemId], [receivedAt]);

CREATE TABLE [dbo].[inv_average_cost] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [quantity] BIGINT NOT NULL CONSTRAINT [inv_average_cost_quantity_df] DEFAULT 0,
    [totalCostMinor] BIGINT NOT NULL CONSTRAINT [inv_average_cost_totalCostMinor_df] DEFAULT 0,
    [unitCostMinor] BIGINT NOT NULL CONSTRAINT [inv_average_cost_unitCostMinor_df] DEFAULT 0,
    [currency] NVARCHAR(3) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [inv_average_cost_version_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_average_cost_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_average_cost_tenantId_itemId_key] UNIQUE NONCLUSTERED ([tenantId], [itemId])
);

CREATE TABLE [dbo].[inv_reservation] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [warehouseId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [lotId] NVARCHAR(36),
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [referenceType] NVARCHAR(32) NOT NULL,
    [referenceId] NVARCHAR(36) NOT NULL,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_reservation_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [inv_reservation_tenantId_referenceType_referenceId_status_idx] ON [dbo].[inv_reservation] ([tenantId], [referenceType], [referenceId], [status]);
CREATE NONCLUSTERED INDEX [inv_reservation_tenantId_warehouseId_itemId_status_idx] ON [dbo].[inv_reservation] ([tenantId], [warehouseId], [itemId], [status]);

CREATE TABLE [dbo].[inv_transfer] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [fromWarehouseId] NVARCHAR(36) NOT NULL,
    [toWarehouseId] NVARCHAR(36) NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [notes] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [inv_transfer_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [shippedAt] DATETIME2,
    [receivedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inv_transfer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_transfer_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [inv_transfer_tenantId_status_idx] ON [dbo].[inv_transfer] ([tenantId], [status]);

CREATE TABLE [dbo].[inv_transfer_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [transferId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [lotId] NVARCHAR(36),
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [unitCostMinor] BIGINT NOT NULL CONSTRAINT [inv_transfer_line_unitCostMinor_df] DEFAULT 0,
    [serialNumbers] NVARCHAR(max),
    CONSTRAINT [inv_transfer_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inv_transfer_line_transferId_lineNo_key] UNIQUE NONCLUSTERED ([transferId], [lineNo])
);

ALTER TABLE [dbo].[inv_lot] ADD CONSTRAINT [inv_lot_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_serial] ADD CONSTRAINT [inv_serial_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_stock_balance] ADD CONSTRAINT [inv_stock_balance_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [inv_stock_movement_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_cost_layer] ADD CONSTRAINT [inv_cost_layer_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_average_cost] ADD CONSTRAINT [inv_average_cost_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_reservation] ADD CONSTRAINT [inv_reservation_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_transfer] ADD CONSTRAINT [inv_transfer_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_transfer_line] ADD CONSTRAINT [inv_transfer_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[inv_transfer_line] ADD CONSTRAINT [inv_transfer_line_transferId_fkey] FOREIGN KEY ([transferId]) REFERENCES [dbo].[inv_transfer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
