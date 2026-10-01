-- The reader cutover needs only participant metadata. Existing user-ID writers
-- remain authoritative for all mutations until their later cutover.
-- The existing message_reactions primary key is already message-ID leading, so
-- this migration deliberately avoids a transactional index build that could
-- block deployed reaction writers. A later operation may add a concurrent
-- order-by index after production measurements justify it.
REVOKE ALL ON TABLE public.messaging_participants FROM app, lifecycle_worker;--> statement-breakpoint
GRANT SELECT ON TABLE public.messaging_participants TO app;