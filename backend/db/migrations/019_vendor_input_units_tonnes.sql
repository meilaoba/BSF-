-- Correct the earlier unit annotation. Production observations show
-- input.dailyInput values such as 0.016 represent 16 kg, so the stored vendor
-- counters are tonnes and must be converted to kg only at calculation/display.
COMMENT ON COLUMN vendor_device_telemetry.daily_input_t IS
  'Vendor input.dailyInput in tonnes';
COMMENT ON COLUMN vendor_device_telemetry.weekly_input_t IS
  'Vendor input.weeklyInput in tonnes';
COMMENT ON COLUMN vendor_device_telemetry.monthly_input_t IS
  'Vendor input.monthlyInput in tonnes';
COMMENT ON COLUMN vendor_device_telemetry.yearly_input_t IS
  'Vendor input.yearlyInput in tonnes';
