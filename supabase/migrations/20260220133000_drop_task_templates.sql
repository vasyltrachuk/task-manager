-- ============================================================================
-- Remove legacy task_templates table.
-- Rulebook rules + task generation log are the new SSOT.
-- ============================================================================

DROP TABLE IF EXISTS task_templates;
