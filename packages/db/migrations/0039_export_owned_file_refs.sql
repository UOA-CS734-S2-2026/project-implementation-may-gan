-- Raw object keys only reach the restricted worker for a proven live
-- post-media or profile-avatar relationship. They never enter record pages.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.read_account_export_file_page(
  p_request_id text, p_lease_token text, p_after text, p_limit integer
)
RETURNS TABLE(file_id text, post_id text, file_kind text, content_type text, byte_size bigint, object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_cutoff timestamptz;
  v_now timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
    OR p_after IS NOT NULL AND char_length(p_after) > 200 THEN RETURN; END IF;
  SELECT lease.owner_id, lease.selection_cutoff_at INTO v_owner, v_cutoff
    FROM public.authorize_account_export_lease(p_request_id, p_lease_token) AS lease;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();

  RETURN QUERY
  SELECT scoped.file_id, scoped.post_id, scoped.file_kind, scoped.content_type,
    scoped.byte_size, scoped.object_key FROM (
    SELECT ('post:' || attachment.id)::text AS file_id, post.id AS post_id,
      'post_media'::text AS file_kind, reservation.content_type, reservation.byte_size,
      reservation.object_key
    FROM public.post_media attachment
      JOIN public.posts post ON post.id = attachment.post_id
      JOIN public.media_reservation reservation ON reservation.id = attachment.reservation_id
    WHERE post.author_id = v_owner AND post.accepted_at <= v_cutoff
      AND (post.trashed_at IS NULL OR post.restore_until > v_now)
      AND attachment.detached_at IS NULL AND attachment.accepted_at <= v_cutoff
      AND reservation.owner_id = v_owner AND reservation.status = 'validated'
      AND reservation.validated_at <= v_cutoff AND reservation.cleanup_claimed_at IS NULL
      AND reservation.object_key = 'media/' || v_owner || '/' || reservation.id
      AND NOT EXISTS (SELECT 1 FROM public.legacy_cloudinary_media legacy WHERE legacy.media_id = attachment.id)
    UNION ALL
    SELECT ('avatar:' || avatar.user_id)::text AS file_id, NULL::text AS post_id,
      'profile_avatar'::text AS file_kind, reservation.content_type, reservation.byte_size,
      reservation.object_key
    FROM public.profile_avatars avatar
      JOIN public.media_reservation reservation ON reservation.id = avatar.reservation_id
    WHERE avatar.user_id = v_owner AND avatar.set_at <= v_cutoff
      AND reservation.owner_id = v_owner AND reservation.status = 'validated'
      AND reservation.validated_at <= v_cutoff AND reservation.cleanup_claimed_at IS NULL
      AND reservation.object_key = 'media/' || v_owner || '/' || reservation.id
  ) AS scoped
  WHERE p_after IS NULL OR scoped.file_id > p_after
  ORDER BY scoped.file_id LIMIT p_limit;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_account_export_file_page(text, text, text, integer)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_account_export_file_page(text, text, text, integer)
  TO lifecycle_worker;--> statement-breakpoint
