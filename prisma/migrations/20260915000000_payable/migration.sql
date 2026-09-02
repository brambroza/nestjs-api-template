BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[fin_vendor_invoice] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [vendorInvoiceNumber] NVARCHAR(64) NOT NULL,
    [vendorId] NVARCHAR(36) NOT NULL,
    [vendorName] NVARCHAR(200) NOT NULL,
    [vendorTaxId] NVARCHAR(20),
    [purchaseOrderId] NVARCHAR(36),
    [currency] NVARCHAR(3) NOT NULL,
    [invoiceDate] DATE NOT NULL,
    [dueDate] DATE NOT NULL,
    [paymentTermsDays] INT NOT NULL,
    [status] NVARCHAR(16) NOT NULL,
    [matchStatus] NVARCHAR(12) NOT NULL,
    [matchIssues] NVARCHAR(max),
    [subtotalMinor] BIGINT NOT NULL,
    [discountMinor] BIGINT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [settledMinor] BIGINT NOT NULL CONSTRAINT [fin_vendor_invoice_settledMinor_df] DEFAULT 0,
    [balanceMinor] BIGINT NOT NULL,
    [notes] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [fin_vendor_invoice_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [postedAt] DATETIME2,
    [voidedAt] DATETIME2,
    [voidReason] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_vendor_invoice_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_vendor_invoice_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number]),
    CONSTRAINT [fin_vendor_invoice_tenantId_vendorId_vendorInvoiceNumber_key] UNIQUE NONCLUSTERED ([tenantId], [vendorId], [vendorInvoiceNumber])
);
CREATE NONCLUSTERED INDEX [fin_vendor_invoice_tenantId_vendorId_status_idx] ON [dbo].[fin_vendor_invoice] ([tenantId], [vendorId], [status]);
CREATE NONCLUSTERED INDEX [fin_vendor_invoice_tenantId_status_dueDate_idx] ON [dbo].[fin_vendor_invoice] ([tenantId], [status], [dueDate]);
CREATE NONCLUSTERED INDEX [fin_vendor_invoice_tenantId_purchaseOrderId_idx] ON [dbo].[fin_vendor_invoice] ([tenantId], [purchaseOrderId]);

CREATE TABLE [dbo].[fin_vendor_invoice_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [invoiceId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [itemId] NVARCHAR(36) NOT NULL,
    [itemSku] NVARCHAR(64) NOT NULL,
    [description] NVARCHAR(200) NOT NULL,
    [uomCode] NVARCHAR(16) NOT NULL,
    [quantity] BIGINT NOT NULL,
    [unitPriceMinor] BIGINT NOT NULL,
    [priceSource] NVARCHAR(12) NOT NULL,
    [priceListId] NVARCHAR(36),
    [discountBp] INT NOT NULL CONSTRAINT [fin_vendor_invoice_line_discountBp_df] DEFAULT 0,
    [discountMinor] BIGINT NOT NULL,
    [netMinor] BIGINT NOT NULL,
    [taxCodeId] NVARCHAR(36) NOT NULL,
    [taxCode] NVARCHAR(16) NOT NULL,
    [taxRateBp] INT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [purchaseOrderLineId] NVARCHAR(36),
    [whtTaxCodeId] NVARCHAR(36),
    [whtTaxCode] NVARCHAR(16),
    [whtRateBp] INT NOT NULL CONSTRAINT [fin_vendor_invoice_line_whtRateBp_df] DEFAULT 0,
    [whtPndForm] NVARCHAR(8),
    [whtIncomeType] NVARCHAR(100),
    CONSTRAINT [fin_vendor_invoice_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_vendor_invoice_line_invoiceId_lineNo_key] UNIQUE NONCLUSTERED ([invoiceId], [lineNo])
);
CREATE NONCLUSTERED INDEX [fin_vendor_invoice_line_tenantId_purchaseOrderLineId_idx] ON [dbo].[fin_vendor_invoice_line] ([tenantId], [purchaseOrderLineId]);

CREATE TABLE [dbo].[fin_payment_voucher] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [vendorId] NVARCHAR(36) NOT NULL,
    [batchId] NVARCHAR(36),
    [currency] NVARCHAR(3) NOT NULL,
    [paymentDate] DATE NOT NULL,
    [method] NVARCHAR(12) NOT NULL,
    [grossMinor] BIGINT NOT NULL,
    [whtMinor] BIGINT NOT NULL CONSTRAINT [fin_payment_voucher_whtMinor_df] DEFAULT 0,
    [netPaidMinor] BIGINT NOT NULL,
    [reference] NVARCHAR(100),
    [chequeNumber] NVARCHAR(32),
    [chequeBank] NVARCHAR(100),
    [chequeDate] DATE,
    [notes] NVARCHAR(max),
    [status] NVARCHAR(12) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [fin_payment_voucher_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [postedAt] DATETIME2,
    [voidedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_payment_voucher_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_payment_voucher_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [fin_payment_voucher_tenantId_vendorId_status_idx] ON [dbo].[fin_payment_voucher] ([tenantId], [vendorId], [status]);
CREATE NONCLUSTERED INDEX [fin_payment_voucher_tenantId_batchId_idx] ON [dbo].[fin_payment_voucher] ([tenantId], [batchId]);

CREATE TABLE [dbo].[fin_payment_allocation] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [voucherId] NVARCHAR(36) NOT NULL,
    [invoiceId] NVARCHAR(36) NOT NULL,
    [amountMinor] BIGINT NOT NULL,
    [whtMinor] BIGINT NOT NULL CONSTRAINT [fin_payment_allocation_whtMinor_df] DEFAULT 0,
    CONSTRAINT [fin_payment_allocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_payment_allocation_voucherId_invoiceId_key] UNIQUE NONCLUSTERED ([voucherId], [invoiceId])
);
CREATE NONCLUSTERED INDEX [fin_payment_allocation_tenantId_invoiceId_idx] ON [dbo].[fin_payment_allocation] ([tenantId], [invoiceId]);

CREATE TABLE [dbo].[fin_payment_batch] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [paymentDate] DATE NOT NULL,
    [method] NVARCHAR(12) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [voucherCount] INT NOT NULL CONSTRAINT [fin_payment_batch_voucherCount_df] DEFAULT 0,
    [totalNetMinor] BIGINT NOT NULL CONSTRAINT [fin_payment_batch_totalNetMinor_df] DEFAULT 0,
    [totalWhtMinor] BIGINT NOT NULL CONSTRAINT [fin_payment_batch_totalWhtMinor_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [fin_payment_batch_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [postedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_payment_batch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_payment_batch_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [fin_payment_batch_tenantId_status_idx] ON [dbo].[fin_payment_batch] ([tenantId], [status]);

CREATE TABLE [dbo].[fin_wht_certificate] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [voucherId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [pndForm] NVARCHAR(8) NOT NULL,
    [vendorId] NVARCHAR(36) NOT NULL,
    [vendorName] NVARCHAR(200) NOT NULL,
    [vendorTaxId] NVARCHAR(20),
    [paymentDate] DATE NOT NULL,
    [totalBaseMinor] BIGINT NOT NULL,
    [totalTaxMinor] BIGINT NOT NULL,
    [isVoid] BIT NOT NULL CONSTRAINT [fin_wht_certificate_isVoid_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_wht_certificate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_wht_certificate_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number]),
    CONSTRAINT [fin_wht_certificate_tenantId_voucherId_key] UNIQUE NONCLUSTERED ([tenantId], [voucherId])
);
CREATE NONCLUSTERED INDEX [fin_wht_certificate_tenantId_vendorId_paymentDate_idx] ON [dbo].[fin_wht_certificate] ([tenantId], [vendorId], [paymentDate]);

CREATE TABLE [dbo].[fin_wht_certificate_line] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [certificateId] NVARCHAR(36) NOT NULL,
    [lineNo] INT NOT NULL,
    [taxCode] NVARCHAR(16) NOT NULL,
    [incomeType] NVARCHAR(100) NOT NULL,
    [rateBp] INT NOT NULL,
    [baseMinor] BIGINT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    CONSTRAINT [fin_wht_certificate_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_wht_certificate_line_certificateId_lineNo_key] UNIQUE NONCLUSTERED ([certificateId], [lineNo])
);

ALTER TABLE [dbo].[fin_vendor_invoice] ADD CONSTRAINT [fin_vendor_invoice_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_vendor_invoice_line] ADD CONSTRAINT [fin_vendor_invoice_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_vendor_invoice_line] ADD CONSTRAINT [fin_vendor_invoice_line_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[fin_vendor_invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_payment_voucher] ADD CONSTRAINT [fin_payment_voucher_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_payment_allocation] ADD CONSTRAINT [fin_payment_allocation_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_payment_allocation] ADD CONSTRAINT [fin_payment_allocation_voucherId_fkey] FOREIGN KEY ([voucherId]) REFERENCES [dbo].[fin_payment_voucher]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_payment_batch] ADD CONSTRAINT [fin_payment_batch_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_wht_certificate] ADD CONSTRAINT [fin_wht_certificate_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_wht_certificate_line] ADD CONSTRAINT [fin_wht_certificate_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_wht_certificate_line] ADD CONSTRAINT [fin_wht_certificate_line_certificateId_fkey] FOREIGN KEY ([certificateId]) REFERENCES [dbo].[fin_wht_certificate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
