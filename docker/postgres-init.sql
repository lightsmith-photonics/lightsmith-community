-- Runs once when the postgres volume is first created (docker-entrypoint-initdb.d).
-- A separate database for the Playwright smoke tests, so they never touch development data.
CREATE DATABASE lightsmith_e2e OWNER lightsmith;
