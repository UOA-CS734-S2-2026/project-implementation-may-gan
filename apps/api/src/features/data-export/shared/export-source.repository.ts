import { schema, type DayliDatabase } from "@dayli/db";
import { and, asc, eq, gt, lte } from "drizzle-orm";
export interface ExportSource {
  records(userId: string, cutoff: Date): AsyncIterable<Record<string, unknown>>;
}

const pageSize = 100;
const instant = (value: Date) => value.toISOString();

/** Whitelisted, keyset-paged source queries. Never add account/session tables or reply joins here. */
export function createPostgresExportSource(database: DayliDatabase): ExportSource {
  return {
    async *records(userId, cutoff) {
      const profile = await database.select({ name: schema.user.name, username: schema.user.username, displayUsername: schema.user.displayUsername, bio: schema.user.bio, mbti: schema.user.mbti, whatIDo: schema.user.whatIDo, listeningTo: schema.user.listeningTo, profileVisibility: schema.user.profileVisibility, email: schema.user.email, createdAt: schema.user.createdAt })
        .from(schema.user).where(eq(schema.user.id, userId)).limit(1);
      if (profile[0]) yield { type: "account_profile", ...profile[0], createdAt: instant(profile[0].createdAt) };

      let postCursor = "";
      for (;;) {
        const rows = await database.select({ id: schema.posts.id, localDate: schema.posts.localDate, reflectiveAnswer: schema.posts.reflectiveAnswer, caption: schema.posts.caption, rating: schema.posts.rating, audience: schema.posts.audience, acceptedAt: schema.posts.acceptedAt, releasedAt: schema.posts.releasedAt, createdAt: schema.posts.createdAt, updatedAt: schema.posts.updatedAt })
          .from(schema.posts).where(and(eq(schema.posts.authorId, userId), gt(schema.posts.id, postCursor), lte(schema.posts.createdAt, cutoff))).orderBy(asc(schema.posts.id)).limit(pageSize);
        for (const row of rows) yield { type: "journal", ...row, acceptedAt: instant(row.acceptedAt), releasedAt: instant(row.releasedAt), createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt) };
        if (rows.length < pageSize) break; postCursor = rows.at(-1)!.id;
      }

      let revisionCursor = "";
      for (;;) {
        const rows = await database.select({ id: schema.postRevisions.id, postId: schema.postRevisions.postId, revisionNumber: schema.postRevisions.revisionNumber, previousReflectiveAnswer: schema.postRevisions.previousReflectiveAnswer, previousCaption: schema.postRevisions.previousCaption, previousRating: schema.postRevisions.previousRating, previousAudience: schema.postRevisions.previousAudience, previousPromptId: schema.postRevisions.previousPromptId, previousAttachmentRefs: schema.postRevisions.previousAttachmentRefs, createdAt: schema.postRevisions.createdAt })
          .from(schema.postRevisions).innerJoin(schema.posts, eq(schema.postRevisions.postId, schema.posts.id))
          .where(and(eq(schema.posts.authorId, userId), gt(schema.postRevisions.id, revisionCursor), lte(schema.postRevisions.createdAt, cutoff))).orderBy(asc(schema.postRevisions.id)).limit(pageSize);
        for (const row of rows) yield { type: "journal_revision", ...row, createdAt: instant(row.createdAt) };
        if (rows.length < pageSize) break; revisionCursor = rows.at(-1)!.id;
      }

      let noteCursor = "";
      for (;;) {
        const rows = await database.select({ id: schema.tomorrowNotes.id, postId: schema.tomorrowNotes.postId, note: schema.tomorrowNotes.note, submittedAt: schema.tomorrowNotes.submittedAt, availableOn: schema.tomorrowNotes.availableOn })
          .from(schema.tomorrowNotes).where(and(eq(schema.tomorrowNotes.authorId, userId), gt(schema.tomorrowNotes.id, noteCursor), lte(schema.tomorrowNotes.submittedAt, cutoff))).orderBy(asc(schema.tomorrowNotes.id)).limit(pageSize);
        for (const row of rows) yield { type: "private_note", ...row, submittedAt: instant(row.submittedAt) };
        if (rows.length < pageSize) break; noteCursor = rows.at(-1)!.id;
      }

      let messageCursor = "";
      for (;;) {
        const rows = await database.select({ id: schema.messages.id, conversationId: schema.messages.conversationId, sequence: schema.messages.sequence, clientMessageId: schema.messages.clientMessageId, body: schema.messages.body, createdAt: schema.messages.createdAt, editedAt: schema.messages.editedAt, unsentAt: schema.messages.unsentAt })
          .from(schema.messages).innerJoin(schema.messagingParticipants, eq(schema.messages.senderParticipantId, schema.messagingParticipants.id))
          .where(and(eq(schema.messagingParticipants.userId, userId), gt(schema.messages.id, messageCursor), lte(schema.messages.createdAt, cutoff))).orderBy(asc(schema.messages.id)).limit(pageSize);
        for (const row of rows) yield { type: "authored_message", ...row, createdAt: instant(row.createdAt), editedAt: row.editedAt ? instant(row.editedAt) : null, unsentAt: row.unsentAt ? instant(row.unsentAt) : null };
        if (rows.length < pageSize) break; messageCursor = rows.at(-1)!.id;
      }
    },
  };
}
