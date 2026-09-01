-- 017_user_avatars.sql
-- Self-service profile pictures. Stored as a small data-URL: the client
-- re-encodes the chosen image to <=256px JPEG through a canvas (which also
-- strips EXIF/GPS metadata) so rows stay a few tens of KB.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
