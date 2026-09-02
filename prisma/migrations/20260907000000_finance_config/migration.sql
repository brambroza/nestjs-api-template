BEGIN TRY

BEGIN TRAN;

-- Currencies (T-130)
CREATE TABLE [dbo].[md_currency] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(3) NOT NULL,
    [name] NVARCHAR(64) NOT NULL,
    [minorUnits] INT NOT NULL CONSTRAINT [md_currency_minorUnits_df] DEFAULT 2,
    [isActive] BIT NOT NULL CONSTRAINT [md_currency_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_currency_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_currency_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_currency_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);

-- FX rates (T-130): 1 quote = rateScaled/1e6 base
CREATE TABLE [dbo].[fin_fx_rate] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [baseCurrency] NVARCHAR(3) NOT NULL,
    [quoteCurrency] NVARCHAR(3) NOT NULL,
    [rateDate] DATE NOT NULL,
    [rateScaled] BIGINT NOT NULL,
    [source] NVARCHAR(16) NOT NULL,
    [fetchedAt] DATETIME2 NOT NULL,
    [createdBy] NVARCHAR(64),
    CONSTRAINT [fin_fx_rate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_fx_rate_tenantId_baseCurrency_quoteCurrency_rateDate_key]
        UNIQUE NONCLUSTERED ([tenantId], [baseCurrency], [quoteCurrency], [rateDate])
);
CREATE NONCLUSTERED INDEX [fin_fx_rate_tenantId_quoteCurrency_rateDate_idx]
    ON [dbo].[fin_fx_rate] ([tenantId], [quoteCurrency], [rateDate]);

-- Tax codes (T-131)
CREATE TABLE [dbo].[fin_tax_code] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(16) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [kind] NVARCHAR(8) NOT NULL,
    [rateBasisPoints] BIGINT NOT NULL,
    [vatTreatment] NVARCHAR(12),
    [pndForm] NVARCHAR(8),
    [whtIncomeType] NVARCHAR(100),
    [isDefault] BIT NOT NULL CONSTRAINT [fin_tax_code_isDefault_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [fin_tax_code_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fin_tax_code_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_tax_code_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_tax_code_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [fin_tax_code_tenantId_kind_isActive_idx]
    ON [dbo].[fin_tax_code] ([tenantId], [kind], [isActive]);
-- One default per (tenant, kind)
CREATE UNIQUE NONCLUSTERED INDEX [fin_tax_code_one_default_per_kind]
    ON [dbo].[fin_tax_code] ([tenantId], [kind]) WHERE [isDefault] = 1;

CREATE TABLE [dbo].[fin_item_tax_override] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [kind] NVARCHAR(8) NOT NULL,
    [taxCodeId] NVARCHAR(36) NOT NULL,
    [reason] NVARCHAR(200),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fin_item_tax_override_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fin_item_tax_override_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_item_tax_override_tenantId_itemId_kind_key] UNIQUE NONCLUSTERED ([tenantId], [itemId], [kind])
);

-- Chart of accounts (T-132)
CREATE TABLE [dbo].[fin_account] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(16) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [nameTh] NVARCHAR(200),
    [type] NVARCHAR(12) NOT NULL,
    [parentId] NVARCHAR(36),
    [path] NVARCHAR(2000) NOT NULL,
    [depth] INT NOT NULL,
    [isPostable] BIT NOT NULL CONSTRAINT [fin_account_isPostable_df] DEFAULT 1,
    [isActive] BIT NOT NULL CONSTRAINT [fin_account_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fin_account_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_account_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_account_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [fin_account_tenantId_parentId_idx] ON [dbo].[fin_account] ([tenantId], [parentId]);
CREATE NONCLUSTERED INDEX [fin_account_tenantId_type_idx] ON [dbo].[fin_account] ([tenantId], [type]);

-- Fiscal years + periods (T-133)
CREATE TABLE [dbo].[fin_fiscal_year] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [name] NVARCHAR(32) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [status] NVARCHAR(8) NOT NULL,
    [closedAt] DATETIME2,
    [closedBy] NVARCHAR(64),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fin_fiscal_year_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_fiscal_year_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_fiscal_year_tenantId_companyId_name_key] UNIQUE NONCLUSTERED ([tenantId], [companyId], [name])
);
CREATE NONCLUSTERED INDEX [fin_fiscal_year_tenantId_companyId_startDate_idx]
    ON [dbo].[fin_fiscal_year] ([tenantId], [companyId], [startDate]);

CREATE TABLE [dbo].[fin_fiscal_period] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [fiscalYearId] NVARCHAR(36) NOT NULL,
    [periodNo] INT NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [status] NVARCHAR(8) NOT NULL,
    [lockedAt] DATETIME2,
    [lockedBy] NVARCHAR(64),
    [lockReason] NVARCHAR(200),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_fiscal_period_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_fiscal_period_fiscalYearId_periodNo_key] UNIQUE NONCLUSTERED ([fiscalYearId], [periodNo])
);
CREATE NONCLUSTERED INDEX [fin_fiscal_period_tenantId_startDate_idx]
    ON [dbo].[fin_fiscal_period] ([tenantId], [startDate]);

-- FKs
ALTER TABLE [dbo].[md_currency] ADD CONSTRAINT [md_currency_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_fx_rate] ADD CONSTRAINT [fin_fx_rate_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_tax_code] ADD CONSTRAINT [fin_tax_code_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_item_tax_override] ADD CONSTRAINT [fin_item_tax_override_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_account] ADD CONSTRAINT [fin_account_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_fiscal_year] ADD CONSTRAINT [fin_fiscal_year_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_fiscal_period] ADD CONSTRAINT [fin_fiscal_period_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_fiscal_period] ADD CONSTRAINT [fin_fiscal_period_fiscalYearId_fkey]
    FOREIGN KEY ([fiscalYearId]) REFERENCES [dbo].[fin_fiscal_year]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
