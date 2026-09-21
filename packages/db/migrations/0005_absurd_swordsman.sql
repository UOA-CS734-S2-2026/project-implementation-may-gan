-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation

CREATE TYPE "public"."friend_request_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."friendship_state" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"status" "friend_request_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "friend_requests_distinct_users_check" CHECK ("friend_requests"."sender_id" <> "friend_requests"."recipient_id"),
	CONSTRAINT "friend_requests_resolution_check" CHECK (("friend_requests"."status" = 'pending' and "friend_requests"."resolved_at" is null) or ("friend_requests"."status" <> 'pending' and "friend_requests"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"state" "friendship_state" NOT NULL,
	"state_changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "friendships_distinct_users_check" CHECK ("friendships"."user_id" <> "friendships"."friend_id")
);
--> statement-breakpoint
CREATE TABLE "relationship_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"blocked_at" timestamp with time zone NOT NULL,
	"unblocked_at" timestamp with time zone,
	CONSTRAINT "relationship_blocks_distinct_users_check" CHECK ("relationship_blocks"."blocker_id" <> "relationship_blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_user_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_blocks" ADD CONSTRAINT "relationship_blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_blocks" ADD CONSTRAINT "relationship_blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_pair_unique" ON "friend_requests" USING btree (least("sender_id", "recipient_id"),greatest("sender_id", "recipient_id")) WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_requests_recipient_status_created_idx" ON "friend_requests" USING btree ("recipient_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "friend_requests_sender_created_idx" ON "friend_requests" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships" USING btree ("user_id","friend_id");--> statement-breakpoint
CREATE INDEX "friendships_friend_id_idx" ON "friendships" USING btree ("friend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_blocks_pair_unique" ON "relationship_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "relationship_blocks_blocked_id_idx" ON "relationship_blocks" USING btree ("blocked_id");--> statement-breakpoint
