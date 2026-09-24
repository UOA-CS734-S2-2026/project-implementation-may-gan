-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
CREATE TYPE "public"."post_audience" AS ENUM('solo', 'friends');--> statement-breakpoint

-- Revision attachment references are metadata-only. The exact three-key
-- shape excludes URLs, storage identifiers, and byte payloads.
CREATE FUNCTION public.dayli_attachment_refs_valid(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  attachment jsonb;
  previous_order numeric := -1;
  current_order numeric;
  seen_media_ids text[] := ARRAY[]::text[];
  current_media_id text;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN
    RETURN false;
  END IF;

  FOR attachment IN SELECT jsonb_array_elements(value) LOOP
    IF jsonb_typeof(attachment) <> 'object' THEN
      RETURN false;
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(attachment)) <> 3
      OR NOT (attachment ?& array['media_id', 'attachment_order', 'status'])
      OR jsonb_typeof(attachment->'media_id') <> 'string'
      OR btrim(attachment->>'media_id') = ''
      OR jsonb_typeof(attachment->'attachment_order') <> 'number'
      OR jsonb_typeof(attachment->'status') <> 'string'
      OR attachment->>'status' NOT IN ('attached', 'detached') THEN
      RETURN false;
    END IF;

    current_media_id := attachment->>'media_id';
    IF current_media_id = ANY(seen_media_ids) THEN
      RETURN false;
    END IF;
    seen_media_ids := array_append(seen_media_ids, current_media_id);

    BEGIN
      current_order := (attachment->>'attachment_order')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN false;
    END;

    IF current_order < 0 OR current_order <> trunc(current_order) OR current_order <= previous_order THEN
      RETURN false;
    END IF;
    previous_order := current_order;
  END LOOP;

  RETURN true;
END;
$function$;--> statement-breakpoint

CREATE TABLE "legacy_cloudinary_media" (
	"media_id" text PRIMARY KEY NOT NULL,
	"cloudinary_public_id" text NOT NULL,
	"cloudinary_url" text NOT NULL,
	"legacy_type" text
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"attachment_order" integer NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detached_at" timestamp with time zone,
	CONSTRAINT "post_media_attachment_order_check" CHECK ("post_media"."attachment_order" >= 0)
);
--> statement-breakpoint

-- The schema deliberately remains capable of more than three attachments for
-- future product changes. The post write service must enforce the current
-- three-attachment, 25 MB, and video-duration limits atomically.

CREATE TABLE "post_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"previous_reflective_answer" text NOT NULL,
	"previous_caption" text,
	"previous_rating" integer NOT NULL,
	"previous_audience" "post_audience" NOT NULL,
	"previous_prompt_id" text NOT NULL,
	"previous_attachment_refs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_revisions_post_number_unique" UNIQUE("post_id","revision_number"),
	CONSTRAINT "post_revisions_revision_number_check" CHECK ("post_revisions"."revision_number" > 0),
	CONSTRAINT "post_revisions_previous_rating_check" CHECK ("post_revisions"."previous_rating" between 1 and 10),
	CONSTRAINT "post_revisions_previous_answer_length_check" CHECK (char_length("post_revisions"."previous_reflective_answer") between 1 and 4000 and "post_revisions"."previous_reflective_answer" = btrim("post_revisions"."previous_reflective_answer")),
	CONSTRAINT "post_revisions_previous_caption_length_check" CHECK ("post_revisions"."previous_caption" is null or char_length("post_revisions"."previous_caption") <= 1000),
	CONSTRAINT "post_revisions_attachment_refs_array_check" CHECK (public.dayli_attachment_refs_valid("post_revisions"."previous_attachment_refs"))
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"local_date" date NOT NULL,
	"prompt_id" text NOT NULL,
	"reflective_answer" text NOT NULL,
	"caption" text,
	"rating" integer NOT NULL,
	"audience" "post_audience" NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_author_local_date_unique" UNIQUE("author_id","local_date"),
	CONSTRAINT "posts_id_author_unique" UNIQUE("id","author_id"),
	CONSTRAINT "posts_rating_check" CHECK ("posts"."rating" between 1 and 10),
	CONSTRAINT "posts_reflective_answer_length_check" CHECK (char_length("posts"."reflective_answer") between 1 and 4000 and "posts"."reflective_answer" = btrim("posts"."reflective_answer")),
	CONSTRAINT "posts_caption_length_check" CHECK ("posts"."caption" is null or char_length("posts"."caption") <= 1000),
	CONSTRAINT "posts_release_after_acceptance_check" CHECK ("posts"."released_at" > "posts"."accepted_at")
);
--> statement-breakpoint
CREATE TABLE "tomorrow_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"note" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_on" date NOT NULL,
	CONSTRAINT "tomorrow_notes_post_id_unique" UNIQUE("post_id"),
	CONSTRAINT "tomorrow_notes_length_check" CHECK (char_length("tomorrow_notes"."note") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "legacy_cloudinary_media" ADD CONSTRAINT "legacy_cloudinary_media_media_id_post_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."post_media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_previous_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("previous_prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tomorrow_notes" ADD CONSTRAINT "tomorrow_notes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tomorrow_notes" ADD CONSTRAINT "tomorrow_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tomorrow_notes" ADD CONSTRAINT "tomorrow_notes_post_author_fk" FOREIGN KEY ("post_id","author_id") REFERENCES "public"."posts"("id","author_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_active_post_order_unique" ON "post_media" USING btree ("post_id","attachment_order") WHERE "post_media"."detached_at" is null;--> statement-breakpoint

-- Media ownership is part of the identity used by revision attachment refs.
-- Reassignment would invalidate already-inserted historical snapshots.
CREATE FUNCTION public.dayli_post_media_post_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    RAISE EXCEPTION 'post_media post ownership is immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE TRIGGER post_media_post_immutable_trigger
BEFORE UPDATE OF post_id ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.dayli_post_media_post_immutable();--> statement-breakpoint

-- Media IDs are durable historical references. Detach rows instead of deleting
-- them, and never mutate an ID that may already occur in a revision snapshot.
CREATE FUNCTION public.dayli_post_media_id_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'post_media IDs are immutable; detach media instead of replacing its ID' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE TRIGGER post_media_id_immutable_trigger
BEFORE UPDATE OF id ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.dayli_post_media_id_immutable();--> statement-breakpoint

CREATE FUNCTION public.dayli_post_media_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user = 'migrator' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'post_media rows cannot be deleted; detach media instead' USING ERRCODE = '55000';
END;
$function$;--> statement-breakpoint

CREATE TRIGGER post_media_delete_guard_trigger
BEFORE DELETE ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.dayli_post_media_delete_guard();--> statement-breakpoint

-- Revisions are historical snapshots, not an editable projection.
CREATE FUNCTION public.dayli_post_revision_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'migrator' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'post_revisions rows are immutable' USING ERRCODE = '55000';
END;
$function$;--> statement-breakpoint

CREATE TRIGGER post_revisions_immutable_trigger
BEFORE UPDATE OR DELETE ON public.post_revisions
FOR EACH ROW EXECUTE FUNCTION public.dayli_post_revision_immutable();--> statement-breakpoint

-- A JSON metadata snapshot cannot use a normal foreign key for its media IDs.
-- Validate only shape-valid snapshots here so malformed values still report
-- through the dedicated JSON shape check below.
CREATE FUNCTION public.dayli_post_revision_attachment_refs_post_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  attachment jsonb;
  referenced_media_id text;
BEGIN
  IF NOT public.dayli_attachment_refs_valid(NEW.previous_attachment_refs) THEN
    RETURN NEW;
  END IF;

  FOR attachment IN SELECT jsonb_array_elements(NEW.previous_attachment_refs) LOOP
    referenced_media_id := attachment->>'media_id';
    IF NOT EXISTS (
      SELECT 1
      FROM public.post_media
      WHERE id = referenced_media_id
        AND post_id = NEW.post_id
    ) THEN
      RAISE EXCEPTION 'revision attachment media ID must belong to revision post' USING ERRCODE = '23503';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE TRIGGER post_revisions_attachment_refs_post_guard_trigger
BEFORE INSERT ON public.post_revisions
FOR EACH ROW EXECUTE FUNCTION public.dayli_post_revision_attachment_refs_post_guard();--> statement-breakpoint

-- Store the first readable Auckland date with the note. Application reads
-- must still require the note author and compare this date with Auckland day.
CREATE FUNCTION public.dayli_tomorrow_note_visibility_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  post_local_date date;
BEGIN
  SELECT local_date
  INTO post_local_date
  FROM public.posts
  WHERE id = NEW.post_id AND author_id = NEW.author_id;

  IF post_local_date IS NULL OR NEW.available_on <> post_local_date + 1 THEN
    RAISE EXCEPTION 'tomorrow note must become available on the following Auckland day' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE TRIGGER tomorrow_notes_visibility_guard_trigger
BEFORE INSERT ON public.tomorrow_notes
FOR EACH ROW EXECUTE FUNCTION public.dayli_tomorrow_note_visibility_guard();--> statement-breakpoint

-- The note availability date is derived from the accepted post's local date.
-- Accepted posts cannot be moved to another Auckland day afterward.
CREATE FUNCTION public.dayli_accepted_post_local_date_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.local_date IS DISTINCT FROM OLD.local_date THEN
    RAISE EXCEPTION 'accepted post local_date is immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE TRIGGER posts_accepted_local_date_immutable_trigger
BEFORE UPDATE OF local_date ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.dayli_accepted_post_local_date_immutable();--> statement-breakpoint

CREATE FUNCTION public.dayli_tomorrow_note_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'migrator' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'tomorrow_notes rows are immutable' USING ERRCODE = '55000';
END;
$function$;--> statement-breakpoint

CREATE TRIGGER tomorrow_notes_immutable_trigger
BEFORE UPDATE OR DELETE ON public.tomorrow_notes
FOR EACH ROW EXECUTE FUNCTION public.dayli_tomorrow_note_immutable();

-- A post's author and Auckland date are part of its identity. The migrator
-- bypass above is intentionally limited to deletion cleanup; normal writes
-- cannot move a post between accounts or days.
CREATE FUNCTION public.dayli_post_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'post author_id is immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE TRIGGER posts_author_immutable_trigger
BEFORE UPDATE OF author_id ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.dayli_post_identity_immutable();
