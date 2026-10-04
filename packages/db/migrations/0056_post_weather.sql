-- A post may carry one weather snapshot: condition, temperature in degrees
-- Celsius, and a place name. Coordinates are never stored. The columns are
-- nullable and all-or-none, so existing posts are unaffected. The owner's data
-- export includes the snapshot with their posts. The constraints are added
-- NOT VALID and validated in a second transaction, as the new columns are all
-- null and cannot violate them.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
BEGIN;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "weather_condition" text, ADD COLUMN IF NOT EXISTS "weather_temperature_c" bigint, ADD COLUMN IF NOT EXISTS "weather_place_name" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_weather_presence_check" CHECK (("posts"."weather_condition" is null) = ("posts"."weather_temperature_c" is null) and
    ("posts"."weather_condition" is null) = ("posts"."weather_place_name" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_weather_condition_check" CHECK ("posts"."weather_condition" is null or "posts"."weather_condition" in ('clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'thunderstorm')) NOT VALID;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_weather_temperature_check" CHECK ("posts"."weather_temperature_c" is null or "posts"."weather_temperature_c" between -90 and 60) NOT VALID;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_weather_place_name_check" CHECK ("posts"."weather_place_name" is null or (char_length("posts"."weather_place_name") between 1 and 80 and "posts"."weather_place_name" = btrim("posts"."weather_place_name") and "posts"."weather_place_name" !~ '[[:cntrl:]]')) NOT VALID;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.read_account_export_page(
  p_request_id text, p_lease_token text, p_kind text, p_after text, p_limit integer
)
RETURNS TABLE(record_key text, payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_cutoff timestamptz;
  v_now timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_kind IS NULL OR p_kind NOT IN ('profile', 'terms', 'age', 'posts', 'post_media', 'profile_avatars', 'revisions', 'notes', 'messages')
    OR p_after IS NOT NULL AND char_length(p_after) > 200 THEN RETURN; END IF;
  SELECT lease.owner_id, lease.selection_cutoff_at INTO v_owner, v_cutoff
    FROM public.authorize_account_export_lease(p_request_id, p_lease_token) AS lease;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();

  IF p_kind = 'profile' THEN
    RETURN QUERY SELECT person.id,
      jsonb_build_object('id', person.id, 'name', person.name, 'username', person.username,
        'username_changed_at', person.username_changed_at, 'display_username', person.display_username,
        'bio', person.bio, 'mbti', person.mbti, 'what_i_do', person.what_i_do,
        'listening_to', person.listening_to, 'profile_visibility', person.profile_visibility,
        'email', person.email, 'email_verified', person.email_verified,
        'created_at', person.created_at, 'updated_at', person.updated_at)
      FROM public."user" person WHERE person.id = v_owner AND person.created_at <= v_cutoff
        AND (p_after IS NULL OR person.id > p_after)
      ORDER BY person.id LIMIT p_limit;
  ELSIF p_kind = 'terms' THEN
    RETURN QUERY SELECT acceptance.terms_version_id,
      jsonb_build_object('user_id', acceptance.user_id, 'terms_version_id', acceptance.terms_version_id,
        'accepted_at', acceptance.accepted_at)
      FROM public.terms_acceptances acceptance
      WHERE acceptance.user_id = v_owner AND acceptance.accepted_at <= v_cutoff
        AND (p_after IS NULL OR acceptance.terms_version_id > p_after)
      ORDER BY acceptance.terms_version_id LIMIT p_limit;
  ELSIF p_kind = 'age' THEN
    RETURN QUERY SELECT declaration.declaration_version,
      jsonb_build_object('user_id', declaration.user_id, 'declaration_version', declaration.declaration_version,
        'declared_at', declaration.declared_at)
      FROM public.age_declarations declaration
      WHERE declaration.user_id = v_owner AND declaration.declared_at <= v_cutoff
        AND (p_after IS NULL OR declaration.declaration_version > p_after)
      ORDER BY declaration.declaration_version LIMIT p_limit;
  ELSIF p_kind = 'posts' THEN
    RETURN QUERY SELECT post.id,
      jsonb_build_object('id', post.id, 'author_id', post.author_id, 'local_date', post.local_date,
        'prompt_id', post.prompt_id, 'reflective_answer', post.reflective_answer,
        'caption', post.caption, 'rating', post.rating, 'audience', post.audience,
        'accepted_at', post.accepted_at, 'released_at', post.released_at,
        'weather_condition', post.weather_condition, 'weather_temperature_c', post.weather_temperature_c,
        'weather_place_name', post.weather_place_name,
        'trashed_at', post.trashed_at, 'restore_until', post.restore_until,
        'trash_purge_due_at', post.trash_purge_due_at, 'created_at', post.created_at,
        'updated_at', post.updated_at)
      FROM public.posts post WHERE post.author_id = v_owner AND post.accepted_at <= v_cutoff
        AND (post.trashed_at IS NULL OR post.restore_until > v_now)
        AND (p_after IS NULL OR post.id > p_after)
      ORDER BY post.id LIMIT p_limit;
  ELSIF p_kind = 'post_media' THEN
    RETURN QUERY SELECT attachment.id,
      jsonb_build_object('id', attachment.id, 'post_id', attachment.post_id,
        'attachment_order', attachment.attachment_order, 'accepted_at', attachment.accepted_at,
        'detached_at', attachment.detached_at, 'post_trashed', post.trashed_at IS NOT NULL)
      FROM public.post_media attachment JOIN public.posts post ON post.id = attachment.post_id
      WHERE post.author_id = v_owner AND post.accepted_at <= v_cutoff
        AND attachment.accepted_at <= v_cutoff
        AND (post.trashed_at IS NULL OR post.restore_until > v_now)
        AND (p_after IS NULL OR attachment.id > p_after)
      ORDER BY attachment.id LIMIT p_limit;
  ELSIF p_kind = 'profile_avatars' THEN
    RETURN QUERY SELECT avatar.user_id,
      jsonb_build_object('user_id', avatar.user_id, 'set_at', avatar.set_at)
      FROM public.profile_avatars avatar
      WHERE avatar.user_id = v_owner AND avatar.set_at <= v_cutoff
        AND (p_after IS NULL OR avatar.user_id > p_after)
      ORDER BY avatar.user_id LIMIT p_limit;
  ELSIF p_kind = 'revisions' THEN
    RETURN QUERY SELECT revision.id,
      jsonb_build_object('id', revision.id, 'post_id', revision.post_id,
        'revision_number', revision.revision_number,
        'previous_reflective_answer', revision.previous_reflective_answer,
        'previous_caption', revision.previous_caption, 'previous_rating', revision.previous_rating,
        'previous_audience', revision.previous_audience, 'previous_prompt_id', revision.previous_prompt_id,
        'previous_attachment_refs', revision.previous_attachment_refs, 'created_at', revision.created_at)
      FROM public.post_revisions revision JOIN public.posts post ON post.id = revision.post_id
      WHERE post.author_id = v_owner AND post.accepted_at <= v_cutoff AND revision.created_at <= v_cutoff
        AND (post.trashed_at IS NULL OR post.restore_until > v_now)
        AND public.dayli_attachment_refs_valid(revision.previous_attachment_refs)
        AND (p_after IS NULL OR revision.id > p_after)
      ORDER BY revision.id LIMIT p_limit;
  ELSIF p_kind = 'notes' THEN
    RETURN QUERY SELECT note.id,
      jsonb_build_object('id', note.id, 'post_id', note.post_id, 'author_id', note.author_id,
        'note', note.note, 'submitted_at', note.submitted_at, 'available_on', note.available_on)
      FROM public.tomorrow_notes note JOIN public.posts post ON post.id = note.post_id
      WHERE note.author_id = v_owner AND post.author_id = v_owner
        AND post.accepted_at <= v_cutoff AND note.submitted_at <= v_cutoff
        AND (post.trashed_at IS NULL OR post.restore_until > v_now)
        AND (p_after IS NULL OR note.id > p_after)
      ORDER BY note.id LIMIT p_limit;
  ELSE
    -- A block retains readable history. Authorship alone does not permit export.
    RETURN QUERY SELECT message.id,
      jsonb_build_object('id', message.id, 'conversation_id', message.conversation_id,
        'sequence', message.sequence, 'body', message.body, 'version', message.version,
        'created_at', message.created_at, 'edited_at', message.edited_at,
        'unsent_at', message.unsent_at)
      FROM public.messages message
        JOIN public.messaging_participants participant ON participant.id = message.sender_participant_id
        JOIN public.conversation_members membership
          ON membership.conversation_id = message.conversation_id
          AND membership.participant_id = participant.id
      WHERE participant.user_id = v_owner AND message.created_at <= v_cutoff
        AND (p_after IS NULL OR message.id > p_after)
      ORDER BY message.id LIMIT p_limit;
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_account_export_page(text, text, text, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_account_export_page(text, text, text, text, integer) TO lifecycle_worker;--> statement-breakpoint
COMMIT;--> statement-breakpoint
BEGIN;--> statement-breakpoint
ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_weather_presence_check";--> statement-breakpoint
ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_weather_condition_check";--> statement-breakpoint
ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_weather_temperature_check";--> statement-breakpoint
ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_weather_place_name_check";--> statement-breakpoint
COMMIT;--> statement-breakpoint
