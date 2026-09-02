BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[md_company] ADD [promptPayId] NVARCHAR(20);

CREATE TABLE [dbo].[fin_tax_invoice_sequence] (
    [tenantId] NVARCHAR(36) NOT NULL,
    [key] NVARCHAR(64) NOT NULL,
    [nextValue] INT NOT NULL CONSTRAINT [fin_tax_invoice_sequence_nextValue_df] DEFAULT 1,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_tax_invoice_sequence_pkey] PRIMARY KEY CLUSTERED ([tenantId], [key])
);

CREATE TABLE [dbo].[fin_sales_invoice] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [branchId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(32),
    [type] NVARCHAR(12) NOT NULL,
    [originalInvoiceId] NVARCHAR(36),
    [reason] NVARCHAR(20),
    [reasonText] NVARCHAR(500),
    [customerId] NVARCHAR(36) NOT NULL,
    [customerName] NVARCHAR(200) NOT NULL,
    [customerTaxId] NVARCHAR(20),
    [customerBranchNumber] NVARCHAR(5),
    [billingAddress] NVARCHAR(500),
    [salesOrderId] NVARCHAR(36),
    [currency] NVARCHAR(3) NOT NULL,
    [invoiceDate] DATE NOT NULL,
    [dueDate] DATE NOT NULL,
    [paymentTermsDays] INT NOT NULL,
    [status] NVARCHAR(16) NOT NULL,
    [subtotalMinor] BIGINT NOT NULL,
    [discountMinor] BIGINT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [settledMinor] BIGINT NOT NULL CONSTRAINT [fin_sales_invoice_settledMinor_df] DEFAULT 0,
    [balanceMinor] BIGINT NOT NULL,
    [notes] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [fin_sales_invoice_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [issuedAt] DATETIME2,
    [voidedAt] DATETIME2,
    [voidReason] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_sales_invoice_pkey] PRIMARY KEY CLUSTERED ([id])
);
-- Tax-invoice numbers are unique once assigned (gapless per branch/month)
CREATE UNIQUE NONCLUSTERED INDEX [fin_sales_invoice_tenantId_number_key]
    ON [dbo].[fin_sales_invoice] ([tenantId], [number]) WHERE [number] IS NOT NULL;
CREATE NONCLUSTERED INDEX [fin_sales_invoice_tenantId_customerId_status_idx] ON [dbo].[fin_sales_invoice] ([tenantId], [customerId], [status]);
CREATE NONCLUSTERED INDEX [fin_sales_invoice_tenantId_status_dueDate_idx] ON [dbo].[fin_sales_invoice] ([tenantId], [status], [dueDate]);
CREATE NONCLUSTERED INDEX [fin_sales_invoice_tenantId_salesOrderId_idx] ON [dbo].[fin_sales_invoice] ([tenantId], [salesOrderId]);
CREATE NONCLUSTERED INDEX [fin_sales_invoice_tenantId_invoiceDate_idx] ON [dbo].[fin_sales_invoice] ([tenantId], [invoiceDate]);

CREATE TABLE [dbo].[fin_sales_invoice_line] (
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
    [discountBp] INT NOT NULL CONSTRAINT [fin_sales_invoice_line_discountBp_df] DEFAULT 0,
    [discountMinor] BIGINT NOT NULL,
    [netMinor] BIGINT NOT NULL,
    [taxCodeId] NVARCHAR(36) NOT NULL,
    [taxCode] NVARCHAR(16) NOT NULL,
    [taxRateBp] INT NOT NULL,
    [taxMinor] BIGINT NOT NULL,
    [totalMinor] BIGINT NOT NULL,
    [salesOrderLineId] NVARCHAR(36),
    CONSTRAINT [fin_sales_invoice_line_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_sales_invoice_line_invoiceId_lineNo_key] UNIQUE NONCLUSTERED ([invoiceId], [lineNo])
);
CREATE NONCLUSTERED INDEX [fin_sales_invoice_line_tenantId_salesOrderLineId_idx] ON [dbo].[fin_sales_invoice_line] ([tenantId], [salesOrderLineId]);

CREATE TABLE [dbo].[fin_receipt] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(24) NOT NULL,
    [customerId] NVARCHAR(36) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [receiptDate] DATE NOT NULL,
    [method] NVARCHAR(12) NOT NULL,
    [amountMinor] BIGINT NOT NULL,
    [whtMinor] BIGINT NOT NULL CONSTRAINT [fin_receipt_whtMinor_df] DEFAULT 0,
    [reference] NVARCHAR(100),
    [chequeNumber] NVARCHAR(32),
    [chequeBank] NVARCHAR(100),
    [chequeDate] DATE,
    [notes] NVARCHAR(max),
    [status] NVARCHAR(12) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [fin_receipt_version_df] DEFAULT 0,
    [createdBy] NVARCHAR(64) NOT NULL,
    [postedAt] DATETIME2,
    [voidedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fin_receipt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_receipt_tenantId_number_key] UNIQUE NONCLUSTERED ([tenantId], [number])
);
CREATE NONCLUSTERED INDEX [fin_receipt_tenantId_customerId_status_idx] ON [dbo].[fin_receipt] ([tenantId], [customerId], [status]);
CREATE NONCLUSTERED INDEX [fin_receipt_tenantId_receiptDate_idx] ON [dbo].[fin_receipt] ([tenantId], [receiptDate]);

CREATE TABLE [dbo].[fin_receipt_allocation] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [receiptId] NVARCHAR(36) NOT NULL,
    [invoiceId] NVARCHAR(36) NOT NULL,
    [amountMinor] BIGINT NOT NULL,
    CONSTRAINT [fin_receipt_allocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fin_receipt_allocation_receiptId_invoiceId_key] UNIQUE NONCLUSTERED ([receiptId], [invoiceId])
);
CREATE NONCLUSTERED INDEX [fin_receipt_allocation_tenantId_invoiceId_idx] ON [dbo].[fin_receipt_allocation] ([tenantId], [invoiceId]);

ALTER TABLE [dbo].[fin_tax_invoice_sequence] ADD CONSTRAINT [fin_tax_invoice_sequence_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_sales_invoice] ADD CONSTRAINT [fin_sales_invoice_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_sales_invoice_line] ADD CONSTRAINT [fin_sales_invoice_line_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_sales_invoice_line] ADD CONSTRAINT [fin_sales_invoice_line_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[fin_sales_invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_receipt] ADD CONSTRAINT [fin_receipt_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_receipt_allocation] ADD CONSTRAINT [fin_receipt_allocation_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[fin_receipt_allocation] ADD CONSTRAINT [fin_receipt_allocation_receiptId_fkey] FOREIGN KEY ([receiptId]) REFERENCES [dbo].[fin_receipt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
