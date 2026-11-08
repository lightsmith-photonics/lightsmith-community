-- Lifting a suspension restores the agent's previous status.
ALTER TABLE "AgentProfile" ADD COLUMN "statusBeforeSuspension" TEXT;
