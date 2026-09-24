import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const profileVisibility = pgEnum("profile_visibility", ["public", "private"]);
export const tier = pgEnum("tier", ["free", "pro"]);

/** Better Auth's stable text identity and the imported legacy profile projection. */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  bio: text("bio"),
  mbti: text("mbti"),
  whatIDo: text("what_i_do"),
  listeningTo: text("listening_to"),
  profileVisibility: profileVisibility("profile_visibility").default("public").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  tier: tier("tier").default("free").notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});
