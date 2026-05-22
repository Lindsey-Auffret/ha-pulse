import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  url: text("url").notNull().unique(),
  source: text("source").notNull(),
  sourceCategory: text("source_category").notNull(), // 'regulatory', 'industry', 'clinical', 'reimbursement', 'general'
  region: text("region").notNull(), // 'North America', 'Europe', 'Asia-Pacific', 'Latin America', 'Middle East & Africa', 'Global'
  country: text("country").notNull(),
  publishedAt: text("published_at").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(true),
  tags: text("tags").notNull().default("[]"), // JSON array of tags
  manufacturers: text("manufacturers").notNull().default("[]"), // JSON array of mentioned manufacturers
  imageUrl: text("image_url"),
});

export const insertArticleSchema = createInsertSchema(articles).omit({ id: true });
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;

export const refreshLogs = sqliteTable("refresh_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  articlesAdded: integer("articles_added").notNull().default(0),
  status: text("status").notNull().default("running"), // 'running', 'completed', 'failed'
  errorMessage: text("error_message"),
});

export const insertRefreshLogSchema = createInsertSchema(refreshLogs).omit({ id: true });
export type InsertRefreshLog = z.infer<typeof insertRefreshLogSchema>;
export type RefreshLog = typeof refreshLogs.$inferSelect;
