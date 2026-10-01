import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const profileVisibility = pgEnum("profile_visibility", ["public", "private"]);
export const tier = pgEnum("tier", ["free", "pro"]);

/** Better Auth's stable text identity and the imported legacy profile projection. */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").unique(),
  /** When the owner last changed an established handle; null until the first change. */
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
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

/**
 * A handle its owner has just given up. Nobody else can claim it until
 * `reservedUntil`, and links to it resolve to the owner's current handle.
 */
export const usernameReservations = pgTable("username_reservations", {
  username: text("username").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("username_reservations_user_id_idx").on(table.userId),
]);
