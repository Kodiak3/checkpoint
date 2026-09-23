import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { bills, corrections, financeState, transactions } from "../db/schema";

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export async function seedFinance() {
  const db = getDb(); const now = new Date().toISOString();
  await db.insert(financeState).values({ id: 1, balancePence: 0, anchorDate: now.slice(0, 10), nextPayDate: null, updatedAt: now }).onConflictDoNothing();
}

export async function getFinanceSnapshot(limit = 40) {
  await seedFinance(); const db = getDb();
  const [state] = await db.select().from(financeState).limit(1);
  const billRows = await db.select().from(bills).orderBy(bills.sortOrder);
  const correctionRows = await db.select().from(corrections).orderBy(corrections.sortOrder);
  const activity = await db.select().from(transactions).orderBy(desc(transactions.sortDate), desc(transactions.createdAt)).limit(Math.max(1, Math.min(200, limit)));
  return { state, bills: billRows, corrections: correctionRows, transactions: activity };
}

export async function recordTransaction(input: { amountPence: number; description: string; date?: string; category?: string; source?: string }) {
  await seedFinance(); const db = getDb(); const now = new Date().toISOString(); const date = input.date && isIsoDate(input.date) ? input.date : now.slice(0, 10);
  const categories = ["Everyday spending", "Income", "Subscriptions & bills", "Transport", "Health", "Transfers", "Reconciliation", "Other"];
  const category = categories.includes(input.category ?? "") ? input.category! : input.amountPence > 0 ? "Income" : "Everyday spending";
  await db.insert(transactions).values({ id: `${input.source ?? "manual"}-${crypto.randomUUID()}`, sortDate: date, displayDate: date, amountPence: input.amountPence, description: input.description.trim().slice(0, 120), category, source: input.source ?? "manual", createdAt: now });
  await db.update(financeState).set({ balancePence: sql`${financeState.balancePence} + ${input.amountPence}`, updatedAt: now }).where(eq(financeState.id, 1));
  return getFinanceSnapshot();
}

export async function reconcileBalance(balancePence: number) {
  await seedFinance(); const db = getDb(); const now = new Date().toISOString(); const date = now.slice(0, 10); const [current] = await db.select().from(financeState).limit(1); const difference = balancePence - current.balancePence;
  await db.update(financeState).set({ balancePence, anchorDate: date, updatedAt: now }).where(eq(financeState.id, 1));
  if (difference !== 0) await db.insert(transactions).values({ id: `reconcile-${crypto.randomUUID()}`, sortDate: date, displayDate: date, amountPence: difference, description: "Balance reconciliation", category: "Reconciliation", source: "manual", createdAt: now });
  return getFinanceSnapshot();
}

export async function toggleBill(id: string, posted: boolean) {
  await seedFinance(); const db = getDb(); const now = new Date().toISOString(); const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1); if (!bill) throw new Error("Bill not found.");
  if ((bill.status === "paid") !== posted) {
    const movement = posted ? -bill.amountPence : bill.amountPence;
    await db.update(bills).set({ status: posted ? "paid" : "due", reserved: !posted }).where(eq(bills.id, id));
    await db.update(financeState).set({ balancePence: sql`${financeState.balancePence} + ${movement}`, updatedAt: now }).where(eq(financeState.id, 1));
    await db.insert(transactions).values({ id: `bill-${crypto.randomUUID()}`, sortDate: now.slice(0, 10), displayDate: now.slice(0, 10), amountPence: movement, description: `${posted ? "Bill posted" : "Bill posting reversed"}: ${bill.name}`, category: "Subscriptions & bills", source: "bill", createdAt: now });
  }
  return getFinanceSnapshot();
}

export type CommitmentInput = { id?: string; name: string; amountPence: number; normalAmountPence?: number | null; timing?: string; dueDate?: string | null; frequency?: string; reserved?: boolean; active?: boolean };
export async function saveCommitment(input: CommitmentInput) {
  await seedFinance(); const db = getDb(); const frequency = ["weekly", "monthly", "quarterly", "yearly", "one-off"].includes(input.frequency ?? "") ? input.frequency! : "monthly"; const dueDate = input.dueDate && isIsoDate(input.dueDate) ? input.dueDate : null;
  const values = { name: input.name.trim().slice(0, 80), amountPence: input.amountPence, normalAmountPence: input.normalAmountPence ?? input.amountPence, timing: (input.timing ?? "").trim().slice(0, 120), dueDate, frequency, reserved: Boolean(input.reserved), active: input.active !== false };
  if (input.id) { const [existing] = await db.select().from(bills).where(eq(bills.id, input.id)).limit(1); if (!existing) throw new Error("Commitment not found."); await db.update(bills).set(values).where(eq(bills.id, input.id)); }
  else { const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(${bills.sortOrder}), 0)` }).from(bills); await db.insert(bills).values({ id: `commitment-${crypto.randomUUID()}`, ...values, status: "due", sortOrder: Number(maxOrder) + 1 }); }
  return getFinanceSnapshot();
}

export async function updateNextPayDate(nextPayDate: string | null) { await seedFinance(); const db = getDb(); await db.update(financeState).set({ nextPayDate, updatedAt: new Date().toISOString() }).where(eq(financeState.id, 1)); return getFinanceSnapshot(); }
function dateForSort(value: string) { const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : new Date().toISOString().slice(0, 10); }
async function hashRecord(date: string, amountPence: number, description: string) { const bytes = new TextEncoder().encode(`${date}|${amountPence}|${description.trim().replace(/\s+/g, " ").toUpperCase()}`); const digest = await crypto.subtle.digest("SHA-256", bytes); return `csv-${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")}`; }
function classify(description: string) { const value = description.toUpperCase(); if (/PAYROLL|SALARY|WAGES/.test(value)) return "Income"; if (/SUBSCRIPTION|DIRECT DEBIT|BILL/.test(value)) return "Subscriptions & bills"; if (/BUS|TRAIN|TRAVEL|TAXI|UBER/.test(value)) return "Transport"; if (/DENTIST|PHARMACY|HEALTH/.test(value)) return "Health"; if (/TRANSFER/.test(value)) return "Transfers"; return "Everyday spending"; }
export type CsvRecord = { date: string; amountPence: number; description: string };
export async function importCsv(records: CsvRecord[], commit: boolean) {
  await seedFinance(); const db = getDb(); const now = new Date().toISOString(); const prepared = await Promise.all(records.map(async (row) => ({ ...row, id: await hashRecord(row.date, row.amountPence, row.description) }))); const existing = await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, prepared.map((row) => row.id))); const existingIds = new Set(existing.map((row) => row.id)); const fresh = prepared.filter((row) => !existingIds.has(row.id));
  const summary = { totalRows: prepared.length, newRows: fresh.length, duplicateRows: prepared.length - fresh.length, newIncomePence: fresh.filter((row) => row.amountPence > 0).reduce((sum, row) => sum + row.amountPence, 0), newSpendingPence: fresh.filter((row) => row.amountPence < 0).reduce((sum, row) => sum - row.amountPence, 0), netPence: fresh.reduce((sum, row) => sum + row.amountPence, 0) };
  if (commit && fresh.length) await db.insert(transactions).values(fresh.map((row) => ({ id: row.id, sortDate: dateForSort(row.date), displayDate: row.date, amountPence: row.amountPence, description: row.description, category: classify(row.description), source: "csv", createdAt: now }))).onConflictDoNothing();
  return commit ? { ...summary, snapshot: await getFinanceSnapshot() } : summary;
}
