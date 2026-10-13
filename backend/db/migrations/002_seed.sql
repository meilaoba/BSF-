-- ===========================================================================
-- BSF backend - seed data (idempotent)
-- ===========================================================================

-- Default global notification preferences (both channels enabled by default,
-- but delivery still requires provider credentials to be configured).
INSERT INTO notification_preferences (scope, channel, enabled, min_severity)
SELECT 'global', c.channel, true, 'warning'
FROM (VALUES ('email'), ('whatsapp')) AS c(channel)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_preferences p
  WHERE p.scope = 'global' AND p.channel = c.channel
    AND p.client_id IS NULL AND p.machine_id IS NULL AND p.user_id IS NULL
);

-- Default alert thresholds applied when a machine has no override:
-- temperature above 58 C or below 12 C raises a critical alert.
INSERT INTO alert_thresholds (machine_id, client_id, metric, min_value, max_value, severity)
SELECT NULL, NULL, 'temperature', 12, 58, 'critical'
WHERE NOT EXISTS (
  SELECT 1 FROM alert_thresholds
  WHERE machine_id IS NULL AND client_id IS NULL AND metric = 'temperature'
);

-- ---------------------------------------------------------------------------
-- Notification templates
-- ---------------------------------------------------------------------------
INSERT INTO notification_templates (code, channel, locale, subject, body, provider_template, description)
VALUES
  (
    'temperature_high', 'email', 'en',
    '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C exceeds {{threshold_c}}C',
    E'BSF Alert\n\nMachine: {{machine_name}} ({{machine_serial}})\nClient: {{client_name}}\nLocation: {{location}}\n\nTemperature: {{temperature_c}} C\nThreshold: {{threshold_c}} C\nRecorded at: {{occurred_at}}\n\nPlease inspect the machine.',
    NULL,
    'High temperature alert sent by email'
  ),
  (
    'temperature_low', 'email', 'en',
    '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C below {{threshold_c}}C',
    E'BSF Alert\n\nMachine: {{machine_name}} ({{machine_serial}})\nClient: {{client_name}}\nLocation: {{location}}\n\nTemperature: {{temperature_c}} C\nThreshold: {{threshold_c}} C\nRecorded at: {{occurred_at}}\n\nPlease inspect the machine.',
    NULL,
    'Low temperature alert sent by email'
  ),
  (
    'temperature_high', 'whatsapp', 'en',
    NULL,
    '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C exceeds {{threshold_c}}C at {{occurred_at}}.',
    'bsf_temperature_alert',
    'High temperature alert sent by WhatsApp'
  ),
  (
    'temperature_low', 'whatsapp', 'en',
    NULL,
    '[{{severity}}] {{machine_name}} temperature {{temperature_c}}C below {{threshold_c}}C at {{occurred_at}}.',
    'bsf_temperature_alert',
    'Low temperature alert sent by WhatsApp'
  ),
  (
    'test_message', 'email', 'en',
    'BSF test notification',
    E'This is a test notification from the BSF Smart Kitchen Waste Bin platform.\n\nSent at: {{occurred_at}}',
    NULL,
    'Sample message used by the notification test buttons'
  ),
  (
    'test_message', 'whatsapp', 'en',
    NULL,
    'BSF test notification. Sent at {{occurred_at}}.',
    'bsf_test_message',
    'Sample message used by the notification test buttons'
  )
ON CONFLICT DO NOTHING;