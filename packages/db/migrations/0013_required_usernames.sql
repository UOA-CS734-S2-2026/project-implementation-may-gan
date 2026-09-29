-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
-- Existing imported usernames can contain mixed case or historical duplicates.
-- This NOT VALID constraint protects every new write without rewriting or
-- invalidating those rows. The trigger below serializes case-folded claims.
ALTER TABLE public."user"
  ADD CONSTRAINT user_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9_]{2,29}$') NOT VALID;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enforce_case_insensitive_username()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.username := lower(NEW.username);
  PERFORM pg_advisory_xact_lock(hashtextextended('dayli:username:' || NEW.username, 145));

  IF EXISTS (
    SELECT 1
    FROM public."user" AS candidate
    WHERE lower(candidate.username) = NEW.username
      AND candidate.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'username is already claimed' USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER enforce_case_insensitive_username
BEFORE INSERT OR UPDATE OF username ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.enforce_case_insensitive_username();
--> statement-breakpoint

-- Preserve established public names before new cards stop deriving them from
-- Better Auth's provider-owned name field.
UPDATE public."user"
SET display_username = name
WHERE username IS NOT NULL
  AND display_username IS NULL;
