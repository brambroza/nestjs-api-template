BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[fin_account_mapping] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [key] NVARCHAR(32) NOT NULL,
    [accountId] NVARCHAR(36) NOT NULL,
    [accountCode] NVARCHAR(16) NOT NULL,
    [updatedBy] NVARCHAR(64) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_account_mapping_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_account_mapping_tenantId_companyId_key_key] UNIQUE NONCLUSTERED ([tenantId], [companyId], [key])
);

CREATE TABLE [dbo].[fin_journal_entry] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [entryDate] DATE NOT NULL,
    [description] NVARCHAR(500) NOT NULL,
    [sourceType] NVARCHAR(24) NOT NULL,
    [sourceId] NVARCHAR(64),
    [sourceKey] NVARCHAR(128),
    [currency] NVARCHAR(3) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [reversalOfId] NVARCHAR(36),
    [reversedById] NVARCHAR(36),
    [approvalRequestId] NVARCHAR(36),
    [totalDebitMinor] BIGINT NOT NULL,
    [totalCreditMinor] BIGINT NOT NULL,
    [version] INT NOT NULL CONSTRAINT [fin_journal_entry_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [postedAt] DATETIME2,
    [postedBy] NVARCHAR(64),
    [voidedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_journal_entry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_journal_entry_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number]),
    CONSTRAINT [fin_journal_entry_tenantId_sourceKey_key] UNIQUE NONCLUSTERED ([tenantId], [sourceKey])
);
CREATE NONCLUSTERED INDEX [fin_journal_entry_tenantId_companyId_entryDate_status_idx] ON [dbo].[fin_journal_entry] ([tenantId], [companyId], [entryDate], [status]);
CREATE NONCLUSTERED INDEX [fin_journal_entry_tenantId_sourceType_sourceId_idx] ON [dbo].[fin_journal_entry] ([tenantId], [sourceType], [sourceId]);

CREATE TABLE [dbo].[fin_journal_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [entryId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [accountId] NVARCHAR(36) NOT NULL,
    [accountCode] NVARCHAR(16) NOT NULL,
    [debitMinor] BIGINT NOT NULL,
    [creditMinor] BIGINT NOT NULL,
    [description] NVARCHAR(200),
    [partyType] NVARCHAR(16),
    [partyId] NVARCHAR(36),
    CONSTRAINT [fin_journal_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_journal_line_entryId_lineNo_key] UNIQUE NONCLUSTERED ([entryId], [lineNo])
);
CREATE NONCLUSTERED INDEX [fin_journal_line_tenantId_accountId_idx] ON [dbo].[fin_journal_line] ([tenantId], [accountId]);
CREATE NONCLUSTERED INDEX [fin_journal_line_tenantId_partyType_partyId_idx] ON [dbo].[fin_journal_line] ([tenantId], [partyType], [partyId]);

ALTER TABLE [dbo].[fin_account_mapping] ADD CONSTRAINT [fin_account_mapping_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_journal_entry] ADD CONSTRAINT [fin_journal_entry_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_journal_line] ADD CONSTRAINT [fin_journal_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_journal_line] ADD CONSTRAINT [fin_journal_line_entryId_fkey] FOREIGN KEY ([entryId]) REFERENCES [dbo].[fin_journal_entry]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
