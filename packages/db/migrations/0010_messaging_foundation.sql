-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file disallowed-unique-constraint

CREATE TYPE "public"."conversation_kind" AS ENUM('direct');--> statement-breakpoint
CREATE TYPE "public"."message_request_state" AS ENUM('pending', 'active', 'declined');--> statement-breakpoint
CREATE TYPE "public"."messaging_outbox_channel" AS ENUM('realtime', 'push');--> statement-breakpoint
CREATE TYPE "public"."messaging_outbox_status" AS ENUM('pending', 'leased', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "conversation_changes" (
	"conversation_id" text NOT NULL,
	"change_sequence" bigint NOT NULL,
	"kind" text NOT NULL,
	"message_id" text,
	"member_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_changes_pk" PRIMARY KEY("conversation_id","change_sequence")
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_sequence" bigint NOT NULL,
	"receipt_sequence" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_members_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversation_members_receipt_read_check" CHECK ("conversation_members"."receipt_sequence" <= "conversation_members"."last_read_sequence")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "conversation_kind" DEFAULT 'direct' NOT NULL,
	"user_low_id" text NOT NULL,
	"user_high_id" text NOT NULL,
	"initiator_id" text NOT NULL,
	"request_state" "message_request_state" NOT NULL,
	"last_message_sequence" bigint NOT NULL,
	"last_change_sequence" bigint NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversations_direct_pair_unique" UNIQUE("user_low_id","user_high_id"),
	CONSTRAINT "conversations_direct_pair_order_check" CHECK ("conversations"."user_low_id" < "conversations"."user_high_id"),
	CONSTRAINT "conversations_initiator_member_check" CHECK ("conversations"."initiator_id" in ("conversations"."user_low_id", "conversations"."user_high_id"))
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "message_reactions_pk" PRIMARY KEY("message_id","user_id"),
	CONSTRAINT "message_reactions_key_check" CHECK ("message_reactions"."reaction" in ('like', 'love', 'laugh', 'surprised', 'sad', 'thanks'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"sender_id" text NOT NULL,
	"client_message_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"body" text,
	"reply_to_message_id" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	"unsent_at" timestamp with time zone,
	CONSTRAINT "messages_conversation_sequence_unique" UNIQUE("conversation_id","sequence"),
	CONSTRAINT "messages_sender_client_message_unique" UNIQUE("sender_id","client_message_id"),
	CONSTRAINT "messages_sequence_positive_check" CHECK ("messages"."sequence" > 0),
	CONSTRAINT "messages_version_positive_check" CHECK ("messages"."version" > 0),
	CONSTRAINT "messages_body_or_tombstone_check" CHECK (("messages"."body" is not null and "messages"."unsent_at" is null) or ("messages"."body" is null and "messages"."unsent_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "messaging_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"change_sequence" bigint NOT NULL,
	"channel" "messaging_outbox_channel" NOT NULL,
	"device_registration_id" text,
	"status" "messaging_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"failure_category" text,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "messaging_outbox_attempts_check" CHECK ("messaging_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"token" text NOT NULL,
	"token_hash" text NOT NULL,
	"opted_in" boolean DEFAULT true NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"invalidated_at" timestamp with time zone,
	CONSTRAINT "push_devices_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "push_devices_user_installation_unique" UNIQUE("user_id","installation_id")
);
--> statement-breakpoint
CREATE TABLE "socket_tickets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"session_expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_low_id_user_id_fk" FOREIGN KEY ("user_low_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_high_id_user_id_fk" FOREIGN KEY ("user_high_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiator_id_user_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_outbox" ADD CONSTRAINT "messaging_outbox_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_outbox" ADD CONSTRAINT "messaging_outbox_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socket_tickets" ADD CONSTRAINT "socket_tickets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_changes_conversation_sequence_idx" ON "conversation_changes" USING btree ("conversation_id","change_sequence");--> statement-breakpoint
CREATE INDEX "conversation_members_user_conversation_idx" ON "conversation_members" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_activity_idx" ON "conversations" USING btree ("last_activity_at","id");--> statement-breakpoint
CREATE INDEX "messages_conversation_sequence_idx" ON "messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_outbox_destination_unique" ON "messaging_outbox" USING btree ("event_id","recipient_id","channel","device_registration_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "messaging_outbox_due_idx" ON "messaging_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "messaging_outbox_lease_idx" ON "messaging_outbox" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "push_devices_user_enabled_idx" ON "push_devices" USING btree ("user_id","opted_in");--> statement-breakpoint
CREATE INDEX "socket_tickets_expiry_idx" ON "socket_tickets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "socket_tickets_session_idx" ON "socket_tickets" USING btree ("session_id");