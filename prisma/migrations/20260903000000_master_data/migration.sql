BEGIN TRY

BEGIN TRAN;

-- User
CREATE TABLE [dbo].[app_user] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [email] NVARCHAR(200) NOT NULL,
    [passwordHash] NVARCHAR(200) NOT NULL,
    [displayName] NVARCHAR(200) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [app_user_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [app_user_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [app_user_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [app_user_tenantId_email_key] UNIQUE NONCLUSTERED ([tenantId], [email])
);
CREATE NONCLUSTERED INDEX [app_user_tenantId_email_idx] ON [dbo].[app_user] ([tenantId], [email]);

-- Role
CREATE TABLE [dbo].[app_role] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [name] NVARCHAR(64) NOT NULL,
    [permissionsJson] NVARCHAR(MAX) NOT NULL,
    [isSystem] BIT NOT NULL CONSTRAINT [app_role_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [app_role_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [app_role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [app_role_tenantId_name_key] UNIQUE NONCLUSTERED ([tenantId], [name])
);

-- UserRole
CREATE TABLE [dbo].[app_user_role] (
    [userId] NVARCHAR(36) NOT NULL,
    [roleId] NVARCHAR(36) NOT NULL,
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [app_user_role_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [app_user_role_pkey] PRIMARY KEY CLUSTERED ([userId], [roleId])
);
CREATE NONCLUSTERED INDEX [app_user_role_roleId_idx] ON [dbo].[app_user_role] ([roleId]);

-- Customer
CREATE TABLE [dbo].[md_customer] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [taxId] NVARCHAR(20),
    [creditLimitSatang] BIGINT NOT NULL CONSTRAINT [md_customer_creditLimitSatang_df] DEFAULT 0,
    [paymentTermsDays] INT NOT NULL CONSTRAINT [md_customer_paymentTermsDays_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [md_customer_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_customer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_customer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_customer_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [md_customer_tenantId_name_idx] ON [dbo].[md_customer] ([tenantId], [name]);

-- Vendor
CREATE TABLE [dbo].[md_vendor] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [taxId] NVARCHAR(20),
    [paymentTermsDays] INT NOT NULL CONSTRAINT [md_vendor_paymentTermsDays_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [md_vendor_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_vendor_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_vendor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_vendor_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);
CREATE NONCLUSTERED INDEX [md_vendor_tenantId_name_idx] ON [dbo].[md_vendor] ([tenantId], [name]);

-- Item
CREATE TABLE [dbo].[md_item] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [sku] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(MAX),
    [defaultUomCode] NVARCHAR(16) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [md_item_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_item_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_item_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_item_tenantId_sku_key] UNIQUE NONCLUSTERED ([tenantId], [sku])
);
CREATE NONCLUSTERED INDEX [md_item_tenantId_name_idx] ON [dbo].[md_item] ([tenantId], [name]);

-- UomDefinition
CREATE TABLE [dbo].[md_uom] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [code] NVARCHAR(16) NOT NULL,
    [name] NVARCHAR(64) NOT NULL,
    [baseUomCode] NVARCHAR(16),
    [conversionRatio] BIGINT NOT NULL CONSTRAINT [md_uom_conversionRatio_df] DEFAULT 1,
    CONSTRAINT [md_uom_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [md_uom_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId], [code])
);

-- Foreign keys (all NoAction on delete/update per template convention)
ALTER TABLE [dbo].[app_user] ADD CONSTRAINT [app_user_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[app_role] ADD CONSTRAINT [app_role_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[app_user_role] ADD CONSTRAINT [app_user_role_userId_fkey]
    FOREIGN KEY ([userId]) REFERENCES [dbo].[app_user]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[app_user_role] ADD CONSTRAINT [app_user_role_roleId_fkey]
    FOREIGN KEY ([roleId]) REFERENCES [dbo].[app_role]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_customer] ADD CONSTRAINT [md_customer_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_vendor] ADD CONSTRAINT [md_vendor_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_item] ADD CONSTRAINT [md_item_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_uom] ADD CONSTRAINT [md_uom_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
