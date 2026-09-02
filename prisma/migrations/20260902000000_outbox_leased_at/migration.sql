BEGIN TRY

BEGIN TRAN;

-- Add leasedAt column
ALTER TABLE [dbo].[outbox_message] ADD [leasedAt] DATETIME2 NULL;

-- Support the stalled-row reclaimer query
CREATE NONCLUSTERED INDEX [outbox_message_status_leasedAt_idx]
  ON [dbo].[outbox_message] ([status], [leasedAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
