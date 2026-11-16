-- Admin
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'ADMIN', 'must_change_password', false),
    updated_at = now()
WHERE email = 'mehdiez@ezz-gestion.app';

-- Visiteur (tout rôle ≠ "admin" = lecture seule)
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'VISITEUR', 'must_change_password', false),
    updated_at = now()
WHERE email = 'imaneha@ezz-gestion.app';
