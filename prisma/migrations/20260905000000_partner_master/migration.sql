BEGIN TRY

BEGIN TRAN;

-- Contact persons (many per customer/vendor)
CREATE TABLE [dbo].[md_partner_contact] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [partnerType] NVARCHAR(16) NOT NULL,
    [partnerId] NVARCHAR(36) NOT NULL,
    [fullName] NVARCHAR(200) NOT NULL,
    [position] NVARCHAR(100),
    [email] NVARCHAR(200),
    [phone] NVARCHAR(30),
    [isPrimary] BIT NOT NULL CONSTRAINT [md_partner_contact_isPrimary_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [md_partner_contact_isActive_df] DEFAULT 1,
    [erasedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_partner_contact_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_partner_contact_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [md_partner_contact_tenantId_partnerType_partnerId_idx]
    ON [dbo].[md_partner_contact] ([tenantId], [partnerType], [partnerId]);
-- One primary contact per partner (filtered unique)
CREATE UNIQUE NONCLUSTERED INDEX [md_partner_contact_one_primary]
    ON [dbo].[md_partner_contact] ([tenantId], [partnerType], [partnerId]) WHERE [isPrimary] = 1;

-- Address book (billing / shipping, many per partner)
CREATE TABLE [dbo].[md_partner_address] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [partnerType] NVARCHAR(16) NOT NULL,
    [partnerId] NVARCHAR(36) NOT NULL,
    [addressType] NVARCHAR(16) NOT NULL,
    [label] NVARCHAR(100),
    [line1] NVARCHAR(200) NOT NULL,
    [line2] NVARCHAR(200),
    [subDistrict] NVARCHAR(100),
    [district] NVARCHAR(100),
    [province] NVARCHAR(100),
    [postalCode] NVARCHAR(10),
    [countryCode] NVARCHAR(2) NOT NULL CONSTRAINT [md_partner_address_countryCode_df] DEFAULT 'TH',
    [branchNumber] NVARCHAR(5),
    [isDefault] BIT NOT NULL CONSTRAINT [md_partner_address_isDefault_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [md_partner_address_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [md_partner_address_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [md_partner_address_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [md_partner_address_tenantId_partnerType_partnerId_idx]
    ON [dbo].[md_partner_address] ([tenantId], [partnerType], [partnerId]);
-- One default address per (partner, addressType)
CREATE UNIQUE NONCLUSTERED INDEX [md_partner_address_one_default_per_type]
    ON [dbo].[md_partner_address] ([tenantId], [partnerType], [partnerId], [addressType]) WHERE [isDefault] = 1;

-- PDPA consent log (append-only)
CREATE TABLE [dbo].[pdpa_consent] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [partnerType] NVARCHAR(16) NOT NULL,
    [partnerId] NVARCHAR(36) NOT NULL,
    [contactId] NVARCHAR(36),
    [purpose] NVARCHAR(32) NOT NULL,
    [action] NVARCHAR(16) NOT NULL,
    [source] NVARCHAR(16) NOT NULL,
    [evidenceRef] NVARCHAR(200),
    [note] NVARCHAR(500),
    [recordedBy] NVARCHAR(64) NOT NULL,
    [recordedAt] DATETIME2 NOT NULL,
    CONSTRAINT [pdpa_consent_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [pdpa_consent_tenantId_partnerType_partnerId_recordedAt_idx]
    ON [dbo].[pdpa_consent] ([tenantId], [partnerType], [partnerId], [recordedAt]);

-- PDPA data-subject requests
CREATE TABLE [dbo].[pdpa_request] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [partnerType] NVARCHAR(16) NOT NULL,
    [partnerId] NVARCHAR(36) NOT NULL,
    [requestType] NVARCHAR(16) NOT NULL,
    [status] NVARCHAR(16) NOT NULL,
    [reason] NVARCHAR(500),
    [requestedBy] NVARCHAR(64) NOT NULL,
    [requestedAt] DATETIME2 NOT NULL,
    [completedBy] NVARCHAR(64),
    [completedAt] DATETIME2,
    [resultNote] NVARCHAR(500),
    CONSTRAINT [pdpa_request_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [pdpa_request_tenantId_partnerType_partnerId_status_idx]
    ON [dbo].[pdpa_request] ([tenantId], [partnerType], [partnerId], [status]);
-- At most one PENDING request per (partner, requestType)
CREATE UNIQUE NONCLUSTERED INDEX [pdpa_request_one_pending_per_type]
    ON [dbo].[pdpa_request] ([tenantId], [partnerType], [partnerId], [requestType]) WHERE [status] = 'PENDING';

-- Tenant FKs (NoAction per template convention)
ALTER TABLE [dbo].[md_partner_contact] ADD CONSTRAINT [md_partner_contact_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[md_partner_address] ADD CONSTRAINT [md_partner_address_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pdpa_consent] ADD CONSTRAINT [pdpa_consent_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[pdpa_request] ADD CONSTRAINT [pdpa_request_tenantId_fkey]
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
