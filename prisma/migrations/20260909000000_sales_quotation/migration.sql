BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[doc_sequence] (
    [tenantId] NVARCHAR(36) NOT NULL,
    [key] NVARCHAR(32) NOT NULL,
    [nextValue] INT NOT NULL CONSTRAINT [doc_sequence_nextValue_df] DEFAULT 1,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [doc_sequence_pkey] PRIMARY KEY CLUSTERED ([tenantId], [key])
);

CREATE TABLE [dbo].[sls_quotation] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [revision] INT NOT NULL CONSTRAINT [sls_quotation_revision_df] DEFAULT 1,
    [customerId] NVARCHAR(36) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [quoteDate] DATE NOT NULL,
    [validUntil] DATE NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [paymentTermsDays] INT NOT NULL,
    [notes] NVARCHAR(max),
    [subtotalMinor] BIGINT NOT NULL,
    [discountMinor] BIGINT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [version] INT NOT NULL CONSTRAINT [sls_quotation_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [sentAt] DATETIME2,
    [resolvedAt] DATETIME2,
    [rejectReason] NVARCHAR(500),
    [salesOrderId] NVARCHAR(36),
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [sls_quotation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sls_quotation_tenantId_number_revision_key] UNIQUE NONCLUSTERED ([tenantId], [number], [revision])
);
CREATE NONCLUSTERED INDEX [sls_quotation_tenantId_customerId_status_idx]
    ON [dbo].[sls_quotation] ([tenantId], [customerId], [status]);
CREATE NONCLUSTERED INDEX [sls_quotation_tenantId_status_validUntil_idx]
    ON [dbo].[sls_quotation] ([tenantId], [status], [validUntil]);

CREATE TABLE [dbo].[sls_quotation_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [quotationId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [description] NVARCHAR(200) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [unitPriceMinor] BIGINT NOT NULL,
    [priceSource] NVARCHAR(12) NOT NULL,
    [priceListId] NVARCHAR(36),
    [discountBp] INT NOT NULL CONSTRAINT [sls_quotation_line_discountBp_df] DEFAULT 0,
    [discountMinor] BIGINT NOT NULL,
    [netMinor] BIGINT NOT NULL,
    [taxCodeId] NVARCHAR(36) NOT NULL,
    [taxCode] NVARCHAR(16) NOT NULL,
    [taxRateBp] INT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    CONSTRAINT [sls_quotation_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sls_quotation_line_quotationId_lineNo_key] UNIQUE NONCLUSTERED ([quotationId], [lineNo])
);
CREATE NONCLUSTERED INDEX [sls_quotation_line_tenantId_itemId_idx]
    ON [dbo].[sls_quotation_line] ([tenantId], [itemId]);

ALTER TABLE [dbo].[doc_sequence] ADD CONSTRAINT [doc_sequence_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_quotation] ADD CONSTRAINT [sls_quotation_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_quotation_line] ADD CONSTRAINT [sls_quotation_line_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[sls_quotation_line] ADD CONSTRAINT [sls_quotation_line_quotationId_fkey]
    FOREIGN KEY ([quotationId]) REFERENCES [dbo].[sls_quotation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
