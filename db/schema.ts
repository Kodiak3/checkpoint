import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const financeState = sqliteTable("finance_state", {
  id: integer("id").primaryKey(),
  balancePence: integer("balance_pence").notNull(),
  anchorDate: text("anchor_date").notNull(),
  nextPayDate: text("next_pay_date"),
  updatedAt: text("updated_at").notNull(),
});

export const bills = sqliteTable("bills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amountPence: integer("amount_pence").notNull(),
  normalAmountPence: integer("normal_amount_pence"),
  timing: text("timing").notNull(),
  dueDate: text("due_date"),
  frequency: text("frequency").notNull().default("monthly"),
  status: text("status").notNull(),
  reserved: integer("reserved", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  sortDate: text("sort_date").notNull(),
  displayDate: text("display_date").notNull(),
  amountPence: integer("amount_pence").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
});

export const corrections = sqliteTable("corrections", {
  id: text("id").primaryKey(),
  note: text("note").notNull(),
  sortOrder: integer("sort_order").notNull(),
});
