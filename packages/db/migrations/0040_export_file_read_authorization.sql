-- Authorize each bounded file read immediately before R2 access. A page from
-- earlier in the build is never proof that a file remains attached or restorable.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.authorize_account_export_file(
  p_request_id text, p_lease_token text, p_file_id text
)
RETURNS TABLE(object_key text, byte_size bigint, content_type text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_cutoff timestamptz;
  v_now timestamptz;
  v_id text;
BEGIN
  IF p_file_id IS NULL OR char_length(p_file_id) > 200 THEN RETURN; END IF;
  SELECT lease.owner_id, lease.selection_cutoff_at INTO v_owner, v_cutoff
    FROM public.authorize_account_export_lease(p_request_id, p_lease_token) AS lease;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();
  IF left(p_file_id, 5) = 'post:' THEN
    v_id := substring(p_file_id FROM 6);
    RETURN QUERY SELECT reservation.object_key, reservation.byte_size, reservation.content_type
      FROM public.post_media attachment
        JOIN public.posts post ON post.id = attachment.post_id
        JOIN public.media_reservation reservation ON reservation.id = attachment.reservation_id
      WHERE attachment.id = v_id AND post.author_id = v_owner AND post.accepted_at <= v_cutoff
        AND (post.trashed_at IS NULL OR post.restore_until > v_now)
        AND attachment.detached_at IS NULL AND attachment.accepted_at <= v_cutoff
        AND reservation.owner_id = v_owner AND reservation.status = 'validated'
        AND reservation.validated_at <= v_cutoff AND reservation.cleanup_claimed_at IS NULL
        AND reservation.object_key = 'media/' || v_owner || '/' || reservation.id
        AND NOT EXISTS (SELECT 1 FROM public.legacy_cloudinary_media legacy WHERE legacy.media_id = attachment.id)
      FOR SHARE OF attachment, post, reservation;
  ELSIF left(p_file_id, 7) = 'avatar:' THEN
    v_id := substring(p_file_id FROM 8);
    RETURN QUERY SELECT reservation.object_key, reservation.byte_size, reservation.content_type
      FROM public.profile_avatars avatar
        JOIN public.media_reservation reservation ON reservation.id = avatar.reservation_id
      WHERE avatar.user_id = v_owner AND avatar.user_id = v_id AND avatar.set_at <= v_cutoff
        AND reservation.owner_id = v_owner AND reservation.status = 'validated'
        AND reservation.validated_at <= v_cutoff AND reservation.cleanup_claimed_at IS NULL
        AND reservation.object_key = 'media/' || v_owner || '/' || reservation.id
      FOR SHARE OF avatar, reservation;
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_account_export_file(text, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.authorize_account_export_file(text, text, text)
  TO lifecycle_worker;--> statement-breakpoint
