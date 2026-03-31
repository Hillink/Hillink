-- Deprecated broad reset script.
-- Use reset-user-data.sql to wipe one user at a time.
--
-- This file is intentionally left as a no-op guard.

select 'Use supabase/reset-user-data.sql for per-user cleanup.' as message;
