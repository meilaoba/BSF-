CREATE TABLE IF NOT EXISTS environment_temperature_samples (
  id BIGSERIAL PRIMARY KEY,
  station TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  temperature_c NUMERIC(6,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'hko_rhrread',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station, observed_at)
);

CREATE INDEX IF NOT EXISTS environment_temperature_samples_day_idx
  ON environment_temperature_samples (station, observed_at DESC);

CREATE TABLE IF NOT EXISTS environment_daily_temperature (
  station TEXT NOT NULL,
  temperature_date DATE NOT NULL,
  average_temp_c NUMERIC(6,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('provisional', 'official')),
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (station, temperature_date)
);
