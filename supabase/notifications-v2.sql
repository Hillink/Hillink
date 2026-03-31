ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'read'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.notifications RENAME COLUMN read TO is_read;
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

UPDATE public.notifications
SET
  type = CASE
    WHEN type IS NOT NULL THEN type
    WHEN lower(coalesce(title, '')) LIKE '%invite%' THEN 'campaign_invited'
    WHEN lower(coalesce(title, '')) LIKE '%payout%' THEN 'payout_sent'
    WHEN lower(coalesce(title, '')) LIKE '%verification%'
      AND lower(coalesce(body, '')) LIKE '%not approved%' THEN 'verification_rejected'
    WHEN lower(coalesce(title, '')) LIKE '%verification%' THEN 'verification_approved'
    ELSE 'new_application'
  END,
  is_read = coalesce(is_read, false),
  email_sent = coalesce(email_sent, false)
WHERE type IS NULL
   OR is_read IS NULL
   OR email_sent IS NULL;

ALTER TABLE public.notifications
  ALTER COLUMN type SET NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN is_read SET DEFAULT false,
  ALTER COLUMN is_read SET NOT NULL,
  ALTER COLUMN email_sent SET DEFAULT false,
  ALTER COLUMN email_sent SET NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'application_accepted', 'application_declined',
    'proof_approved', 'proof_rejected',
    'new_application', 'proof_submitted',
    'challenge_completed', 'xp_earned',
    'campaign_invited', 'campaign_invite',
    'admin_broadcast',
    'payout_sent', 'campaign_cancelled',
    'campaign_completed',
    'verification_approved', 'verification_rejected',
    'athlete_verification_approved', 'athlete_verification_rejected',
    'deliverable_submitted', 'deliverable_reviewed',
    'dispute_opened', 'dispute_resolved'
  ));
