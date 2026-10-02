-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"parent_comment_id" text,
	"client_comment_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "post_comments_post_id_id_unique" UNIQUE("post_id","id"),
	CONSTRAINT "post_comments_author_client_comment_unique" UNIQUE("author_id","client_comment_id"),
	CONSTRAINT "post_comments_not_own_parent_check" CHECK ("post_comments"."parent_comment_id" is null or "post_comments"."parent_comment_id" <> "post_comments"."id"),
	CONSTRAINT "post_comments_body_length_check" CHECK (char_length("post_comments"."body") between 1 and 1000 and "post_comments"."body" = btrim("post_comments"."body")),
	CONSTRAINT "post_comments_client_comment_id_length_check" CHECK (char_length("post_comments"."client_comment_id") between 1 and 255),
	CONSTRAINT "post_comments_deleted_by_check" CHECK (("post_comments"."deleted_at" is null) = ("post_comments"."deleted_by" is null))
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_same_post_fk" FOREIGN KEY ("post_id","parent_comment_id") REFERENCES "public"."post_comments"("post_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_post_created_idx" ON "post_comments" USING btree ("post_id","created_at","id");--> statement-breakpoint
CREATE INDEX "post_comments_author_id_idx" ON "post_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_likes_post_created_idx" ON "post_likes" USING btree ("post_id","created_at","user_id");--> statement-breakpoint
CREATE INDEX "post_likes_user_id_idx" ON "post_likes" USING btree ("user_id");