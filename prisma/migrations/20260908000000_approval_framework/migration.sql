BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[apv_policy] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [documentType] NVARCHAR(32) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [apv_policy_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [apv_policy_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [apv_policy_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [apv_policy_tenantId_documentType_isActive_idx]
    ON [dbo].[apv_policy] ([tenantId], [documentType], [isActive]);
-- One active policy per (tenant, documentType)
CREATE UNIQUE NONCLUSTERED INDEX [apv_policy_one_active_per_type]
    ON [dbo].[apv_policy] ([tenantId], [documentType]) WHERE [isActive] = 1;

CREATE TABLE [dbo].[apv_policy_step] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [policyId] NVARCHAR(36) NOT NULL,
    [stepNo] INT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [approverRole] NVARCHAR(64) NOT NULL,
    [minAmountMinor] BIGINT,
    [requiredApprovals] INT NOT NULL CONSTRAINT [apv_policy_step_requiredApprovals_df] DEFAULT 1,
    CONSTRAINT [apv_policy_step_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [apv_policy_step_policyId_stepNo_key] UNIQUE NONCLUSTERED ([policyId], [stepNo])
);

CREATE TABLE [dbo].[apv_request] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [documentType] NVARCHAR(32) NOT NULL,
    [documentId] NVARCHAR(36) NOT NULL,
    [policyId] NVARCHAR(36),
    [amountMinor] BIGINT NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [requestedBy] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    [currentStepNo] INT,
    [createdAt] DATETIME2 NOT NULL,
    [resolvedAt] DATETIME2,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [apv_request_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [apv_request_tenantId_documentType_documentId_idx]
    ON [dbo].[apv_request] ([tenantId], [documentType], [documentId]);
CREATE NONCLUSTERED INDEX [apv_request_tenantId_status_idx] ON [dbo].[apv_request] ([tenantId], [status]);
-- At most one PENDING request per document
CREATE UNIQUE NONCLUSTERED INDEX [apv_request_one_pending_per_document]
    ON [dbo].[apv_request] ([tenantId], [documentType], [documentId]) WHERE [status] = 'PENDING';

CREATE TABLE [dbo].[apv_request_step] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [requestId] NVARCHAR(36) NOT NULL,
    [stepNo] INT NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [approverRole] NVARCHAR(64) NOT NULL,
    [requiredApprovals] INT NOT NULL,
    [status] NVARCHAR(12) NOT NULL,
    CONSTRAINT [apv_request_step_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [apv_request_step_requestId_stepNo_key] UNIQUE NONCLUSTERED ([requestId], [stepNo])
);
CREATE NONCLUSTERED INDEX [apv_request_step_tenantId_approverRole_status_idx]
    ON [dbo].[apv_request_step] ([tenantId], [approverRole], [status]);

CREATE TABLE [dbo].[apv_decision] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [stepId] NVARCHAR(36) NOT NULL,
    [decidedBy] NVARCHAR(64) NOT NULL,
    [onBehalfOf] NVARCHAR(64),
    [decision] NVARCHAR(8) NOT NULL,
    [comment] NVARCHAR(500),
    [decidedAt] DATETIME2 NOT NULL,
    CONSTRAINT [apv_decision_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [apv_decision_tenantId_decidedBy_idx] ON [dbo].[apv_decision] ([tenantId], [decidedBy]);

CREATE TABLE [dbo].[apv_delegation] (
    [id] NVARCHAR(36) NOT NULL,
    [tenantId] NVARCHAR(36) NOT NULL,
    [fromUserId] NVARCHAR(64) NOT NULL,
    [toUserId] NVARCHAR(64) NOT NULL,
    [fromDate] DATE NOT NULL,
    [toDate] DATE NOT NULL,
    [reason] NVARCHAR(200),
    [isActive] BIT NOT NULL CONSTRAINT [apv_delegation_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [apv_delegation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [apv_delegation_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [apv_delegation_tenantId_toUserId_isActive_idx]
    ON [dbo].[apv_delegation] ([tenantId], [toUserId], [isActive]);
CREATE NONCLUSTERED INDEX [apv_delegation_tenantId_fromUserId_idx]
    ON [dbo].[apv_delegation] ([tenantId], [fromUserId]);

ALTER TABLE [dbo].[apv_policy] ADD CONSTRAINT [apv_policy_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[apv_policy_step] ADD CONSTRAINT [apv_policy_step_policyId_fkey]
    FOREIGN KEY ([policyId]) REFERENCES [dbo].[apv_policy]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[apv_request] ADD CONSTRAINT [apv_request_tenantId_fkey]
    FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[apv_request_step] ADD CONSTRAINT [apv_request_step_requestId_fkey]
    FOREIGN KEY ([requestId]) REFERENCES [dbo].[apv_request]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[apv_decision] ADD CONSTRAINT [apv_decision_stepId_fkey]
    FOREIGN KEY ([stepId]) REFERENCES [dbo].[apv_request_step]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[apv_delegation] ADD CONSTRAINT [apv_delegation_tenantId_fkey]
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
