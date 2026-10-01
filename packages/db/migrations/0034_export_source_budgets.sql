SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- Every projected text value is bounded before JSONB construction. Four records
-- per page times the 32 KiB checked record ceiling gives a 128 KiB SQL response
-- ceiling, below one multipart buffer and independent of driver buffering.
CREATE OR REPLACE FUNCTION public.dayli_export_bounded_text(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_value IS NOT NULL AND octet_length(p_value) > 16384 THEN RAISE EXCEPTION 'export field exceeds 16384 bytes'; END IF;
  RETURN p_value;
END $$;--> statement-breakpoint
CREATE FUNCTION public.dayli_export_checked_record(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF octet_length(p_value::text) > 32768 THEN RAISE EXCEPTION 'export record exceeds 32768 bytes'; END IF;
  RETURN p_value;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_export_checked_attachment_refs(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 8 OR octet_length(p_value::text) > 8192 THEN RAISE EXCEPTION 'export attachment references exceed record bounds'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) x WHERE jsonb_typeof(x.value) <> 'object' OR octet_length(coalesce(x.value->>'media_id','')) > 512 OR octet_length(coalesce(x.value->>'status','')) > 512 OR octet_length(coalesce(x.value->>'attachment_order','')) > 32) THEN RAISE EXCEPTION 'export attachment reference exceeds record bounds'; END IF;
  RETURN p_value;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_source_page(p_id text, p_lease_token text, p_kind text, p_cursor text)
RETURNS TABLE(record jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; cutoff timestamptz;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_kind NOT IN ('profile', 'journals', 'revisions', 'notes', 'messages') THEN RAISE EXCEPTION 'export source denied'; END IF;
  SELECT r.user_id, r.snapshot_cutoff_at INTO subject, cutoff FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id WHERE r.id=p_id AND r.status='building' AND r.lease_token=p_lease_token AND r.lease_expires_at>now() AND r.snapshot_cutoff_at IS NOT NULL AND (l.state IS NULL OR (l.state IN ('active','pending_deletion') AND l.generation=r.lifecycle_generation));
  IF NOT FOUND THEN RETURN; END IF;
  IF p_kind='profile' THEN RETURN QUERY SELECT public.dayli_export_checked_record(jsonb_build_object('type','account_profile','name',public.dayli_export_bounded_text(u.name),'username',public.dayli_export_bounded_text(u.username),'displayUsername',public.dayli_export_bounded_text(u.display_username),'bio',public.dayli_export_bounded_text(u.bio),'mbti',public.dayli_export_bounded_text(u.mbti),'whatIDo',public.dayli_export_bounded_text(u.what_i_do),'listeningTo',public.dayli_export_bounded_text(u.listening_to),'profileVisibility',public.dayli_export_bounded_text(u.profile_visibility::text),'email',public.dayli_export_bounded_text(u.email),'createdAt',u.created_at)) FROM public."user" u WHERE u.id=subject;
  ELSIF p_kind='journals' THEN RETURN QUERY SELECT public.dayli_export_checked_record(jsonb_build_object('type','journal','id',public.dayli_export_bounded_text(p.id),'localDate',p.local_date,'reflectiveAnswer',public.dayli_export_bounded_text(p.reflective_answer),'caption',public.dayli_export_bounded_text(p.caption),'rating',p.rating,'audience',public.dayli_export_bounded_text(p.audience::text),'acceptedAt',p.accepted_at,'releasedAt',p.released_at,'createdAt',p.created_at,'updatedAt',p.updated_at)) FROM public.posts p WHERE p.author_id=subject AND p.id>p_cursor AND p.created_at<=cutoff ORDER BY p.id LIMIT 4;
  ELSIF p_kind='revisions' THEN RETURN QUERY SELECT public.dayli_export_checked_record(jsonb_build_object('type','journal_revision','id',public.dayli_export_bounded_text(r.id),'postId',public.dayli_export_bounded_text(r.post_id),'revisionNumber',r.revision_number,'previousReflectiveAnswer',public.dayli_export_bounded_text(r.previous_reflective_answer),'previousCaption',public.dayli_export_bounded_text(r.previous_caption),'previousRating',r.previous_rating,'previousAudience',public.dayli_export_bounded_text(r.previous_audience::text),'previousPromptId',public.dayli_export_bounded_text(r.previous_prompt_id),'previousAttachmentRefs',(SELECT coalesce(jsonb_agg(jsonb_build_object('media_id',public.dayli_export_bounded_text(x.value->>'media_id'),'attachment_order',(x.value->>'attachment_order')::integer,'status',public.dayli_export_bounded_text(x.value->>'status'))),'[]'::jsonb) FROM jsonb_array_elements(public.dayli_export_checked_attachment_refs(r.previous_attachment_refs)) x),'createdAt',r.created_at)) FROM public.post_revisions r JOIN public.posts p ON p.id=r.post_id WHERE p.author_id=subject AND r.id>p_cursor AND r.created_at<=cutoff ORDER BY r.id LIMIT 4;
  ELSIF p_kind='notes' THEN RETURN QUERY SELECT public.dayli_export_checked_record(jsonb_build_object('type','private_note','id',public.dayli_export_bounded_text(n.id),'postId',public.dayli_export_bounded_text(n.post_id),'note',public.dayli_export_bounded_text(n.note),'submittedAt',n.submitted_at,'availableOn',n.available_on)) FROM public.tomorrow_notes n WHERE n.author_id=subject AND n.id>p_cursor AND n.submitted_at<=cutoff ORDER BY n.id LIMIT 4;
  ELSE RETURN QUERY SELECT public.dayli_export_checked_record(jsonb_build_object('type','authored_message','id',public.dayli_export_bounded_text(m.id),'conversationId',public.dayli_export_bounded_text(m.conversation_id),'sequence',m.sequence,'clientMessageId',public.dayli_export_bounded_text(m.client_message_id),'body',public.dayli_export_bounded_text(m.body),'createdAt',m.created_at,'editedAt',m.edited_at,'unsentAt',m.unsent_at)) FROM public.messages m JOIN public.messaging_participants mp ON mp.id=m.sender_participant_id WHERE mp.user_id=subject AND m.id>p_cursor AND m.created_at<=cutoff ORDER BY m.id LIMIT 4;
  END IF;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.dayli_export_checked_record(jsonb) FROM PUBLIC, app;--> statement-breakpoint
