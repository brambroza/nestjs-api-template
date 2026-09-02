BEGIN TRY

BEGIN TRAN;

-- Item: category reference + lot/serial tracking policy (T-122, T-124)
ALTER TABLE [dbo].[md_item] ADD
    [categoryId] NVARCHAR(36) NULL,
    [trackingPolicy] NVARCHAR(8) NOT NULL CONSTRAINT [md_item_trackingPolicy_df] DEFAULT 'NONE',
    [shelfLifeDays] INT NULL;
CREATE NONCLUSTERED INDEX [md_item_tenantId_categoryId_idx]
    ON [dbo].[md_item] ([tenantId], [categoryId]);

-- Production order: which finished good is being made (T-125)
ALTER TABLE [dbo].[production_order] ADD [productSku] NVARCHAR(64) NULL;

-- Item categories (tree, materialized path)
CREATE TABLE [dbo].[md_item_category] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [parentId] NVARCHAR(36),
    [path] NVARCHAR(2000) NOT NULL,
    [depth] INT NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [md_item_category_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_item_category_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_item_category_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_item_category_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [md_item_category_tenantId_parentId_idx]
    ON [dbo].[md_item_category] ([tenantId], [parentId]);

-- Price lists (T-123)
CREATE TABLE [dbo].[md_price_list] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [customerId] NVARCHAR(36),
    [validFrom] DATETIME2 NOT NULL,
    [validTo] DATETIME2,
    [isActive] BIT NOT NULL CONSTRAINT [md_price_list_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_price_list_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_price_list_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_price_list_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [md_price_list_tenantId_customerId_validFrom_idx]
    ON [dbo].[md_price_list] ([tenantId], [customerId], [validFrom]);

CREATE TABLE [dbo].[md_price_list_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [priceListId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [minQty] BIGINT NOT NULL CONSTRAINT [md_price_list_line_minQty_df] DEFAULT 1,
    [unitPriceSatang] BIGINT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_price_list_line_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [md_price_list_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_price_list_line_priceListId_itemId_uomCode_minQty_key]
        UNIQUE NONCLUSTERED ([priceListId], [itemId], [uomCode], [minQty])
);
CREATE NONCLUSTERED INDEX [md_price_list_line_tenantId_itemId_idx]
    ON [dbo].[md_price_list_line] ([tenantId], [itemId]);

-- Master BOM (T-125)
CREATE TABLE [dbo].[md_bom] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [productSku] NVARCHAR(64) NOT NULL,
    [version] INT NOT NULL,
    [name] NVARCHAR(200),
    [isActive] BIT NOT NULL CONSTRAINT [md_bom_isActive_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_bom_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_bom_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_bom_tenantId_itemId_version_key] UNIQUE NONCLUSTERED ([tenantId], [itemId], [version])
);
CREATE NONCLUSTERED INDEX [md_bom_tenantId_productSku_isActive_idx]
    ON [dbo].[md_bom] ([tenantId], [productSku], [isActive]);
-- One active BOM version per item
CREATE UNIQUE NONCLUSTERED INDEX [md_bom_one_active_per_item]
    ON [dbo].[md_bom] ([tenantId], [itemId]) WHERE [isActive] = 1;

CREATE TABLE [dbo].[md_bom_component] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [bomId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [componentItemId] NVARCHAR(36) NOT NULL,
    [componentSku] NVARCHAR(64) NOT NULL,
    [qtyPerUnitValue] BIGINT NOT NULL,
    [qtyPerUnitUom] NVARCHAR(16) NOT NULL,
    [scrapBasisPoints] BIGINT NOT NULL CONSTRAINT [md_bom_component_scrapBasisPoints_df] DEFAULT 0,
    [yieldBasisPoints] BIGINT NOT NULL CONSTRAINT [md_bom_component_yieldBasisPoints_df] DEFAULT 10000,
    [minPackValue] BIGINT NOT NULL CONSTRAINT [md_bom_component_minPackValue_df] DEFAULT 1,
    [minPackUom] NVARCHAR(16) NOT NULL,
    CONSTRAINT [md_bom_component_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_bom_component_bomId_lineNo_key] UNIQUE NONCLUSTERED ([bomId], [lineNo]),
    CONSTRAINT [md_bom_component_bomId_componentItemId_key] UNIQUE NONCLUSTERED ([bomId], [componentItemId])
);
CREATE NONCLUSTERED INDEX [md_bom_component_tenantId_componentItemId_idx]
    ON [dbo].[md_bom_component] ([tenantId], [componentItemId]);

-- FKs
ALTER TABLE [dbo].[md_item_category] ADD CONSTRAINT [md_item_category_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_price_list] ADD CONSTRAINT [md_price_list_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_price_list_line] ADD CONSTRAINT [md_price_list_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_price_list_line] ADD CONSTRAINT [md_price_list_line_priceListId_fkey]
    FOREIGN KEY ([priceListId]) REFERENCES [dbo].[md_price_list]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_bom] ADD CONSTRAINT [md_bom_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_bom_component] ADD CONSTRAINT [md_bom_component_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_bom_component] ADD CONSTRAINT [md_bom_component_bomId_fkey]
    FOREIGN KEY ([bomId]) REFERENCES [dbo].[md_bom]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
