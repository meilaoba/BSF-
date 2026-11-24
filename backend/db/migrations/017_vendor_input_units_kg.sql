-- Vendor input counters are reported in kilograms. The physical column names
-- predate that confirmation and are retained for deployment compatibility.
COMMENT ON COLUMN vendor_device_telemetry.daily_input_t IS
  'Vendor input.dailyInput in kilograms (legacy column name)';
COMMENT ON COLUMN vendor_device_telemetry.weekly_input_t IS
  'Vendor input.weeklyInput in kilograms (legacy column name)';
COMMENT ON COLUMN vendor_device_telemetry.monthly_input_t IS
  'Vendor input.monthlyInput in kilograms (legacy column name)';
COMMENT ON COLUMN vendor_device_telemetry.yearly_input_t IS
  'Vendor input.yearlyInput in kilograms (legacy column name)';
