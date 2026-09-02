BEGIN TRY

BEGIN TRAN;

-- Company (legal entity under a tenant)
CREATE TABLE [dbo].[md_company] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [legalName] NVARCHAR(200) NOT NULL,
    [taxId] NVARCHAR(20),
    [baseCurrency] NVARCHAR(3) NOT NULL CONSTRAINT [md_company_baseCurrency_df] DEFAULT 'THB',
    [isActive] BIT NOT NULL CONSTRAINT [md_company_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_company_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_company_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_company_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [md_company_tenantId_name_idx] ON [dbo].[md_company] ([tenantId], [name]);

-- Branch (Revenue Department branch under a company)
CREATE TABLE [dbo].[md_branch] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [branchNumber] NVARCHAR(5) NOT NULL CONSTRAINT [md_branch_branchNumber_df] DEFAULT '00000',
    [addressLine1] NVARCHAR(200),
    [addressLine2] NVARCHAR(200),
    [subDistrict] NVARCHAR(100),
    [district] NVARCHAR(100),
    [province] NVARCHAR(100),
    [postalCode] NVARCHAR(10),
    [isHeadOffice] BIT NOT NULL CONSTRAINT [md_branch_isHeadOffice_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [md_branch_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_branch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_branch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_branch_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code]),
    CONSTRAINT [md_branch_tenantId_companyId_branchNumber_key] UNIQUE NONCLUSTERED ([tenantId], [companyId], [branchNumber])
);
CREATE NONCLUSTERED INDEX [md_branch_tenantId_companyId_idx] ON [dbo].[md_branch] ([tenantId], [companyId]);

-- Warehouse (physical stock location under a branch)
CREATE TABLE [dbo].[md_warehouse] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [branchId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [md_warehouse_isDefault_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [md_warehouse_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_warehouse_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_warehouse_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_warehouse_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [md_warehouse_tenantId_branchId_idx] ON [dbo].[md_warehouse] ([tenantId], [branchId]);

-- Foreign keys (all NoAction per template convention — MSSQL rejects multiple cascade paths)
ALTER TABLE [dbo].[md_company] ADD CONSTRAINT [md_company_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_branch] ADD CONSTRAINT [md_branch_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_branch] ADD CONSTRAINT [md_branch_companyId_fkey]
    FOREIGN KEY ([companyId]) REFERENCES [dbo].[md_company]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_warehouse] ADD CONSTRAINT [md_warehouse_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_warehouse] ADD CONSTRAINT [md_warehouse_branchId_fkey]
    FOREIGN KEY ([branchId]) REFERENCES [dbo].[md_branch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- One default warehouse per branch. Filtered unique index — MSSQL treats
-- multiple 0s as distinct only via the WHERE clause.
CREATE UNIQUE NONCLUSTERED INDEX [md_warehouse_one_default_per_branch]
    ON [dbo].[md_warehouse] ([tenantId], [branchId]) WHERE [isDefault] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
