import { getFinanceSnapshot, importCsv, isIsoDate, reconcileBalance, recordTransaction, saveCommitment, toggleBill, updateNextPayDate, type CsvRecord } from "../../../lib/finance";

export const runtime = "edge";

export async function GET() {
  try { return Response.json(await getFinanceSnapshot()); }
  catch (error) { console.error("finance GET failed", error); return Response.json({ error: "The finance database is temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "manual-transaction") {
      const amountPence = Number(body.amountPence); const description = String(body.description ?? "Manual update").trim().slice(0, 120); const date = String(body.date ?? "");
      if (!Number.isInteger(amountPence) || amountPence === 0 || Math.abs(amountPence) > 100_000_000) return Response.json({ error: "Enter a valid non-zero amount." }, { status: 400 });
      if (date && !isIsoDate(date)) return Response.json({ error: "Enter a valid transaction date." }, { status: 400 });
      return Response.json(await recordTransaction({ amountPence, description, date: date || undefined, category: String(body.category ?? "") }));
    }
    if (action === "reconcile-balance") {
      const balancePence = Number(body.balancePence);
      if (!Number.isInteger(balancePence) || balancePence < 0 || balancePence > 100_000_000) return Response.json({ error: "Enter a valid bank balance." }, { status: 400 });
      return Response.json(await reconcileBalance(balancePence));
    }
    if (action === "toggle-bill") return Response.json(await toggleBill(String(body.id ?? ""), Boolean(body.posted)));
    if (action === "save-commitment") {
      const name = String(body.name ?? "").trim(); const amountPence = Number(body.amountPence); const normalAmountPence = body.normalAmountPence == null ? amountPence : Number(body.normalAmountPence); const dueDate = String(body.dueDate ?? "");
      if (!name || !Number.isInteger(amountPence) || amountPence <= 0 || amountPence > 100_000_000) return Response.json({ error: "Enter a name and a valid amount." }, { status: 400 });
      if (!Number.isInteger(normalAmountPence) || normalAmountPence <= 0) return Response.json({ error: "Enter a valid normal amount." }, { status: 400 });
      if (dueDate && !isIsoDate(dueDate)) return Response.json({ error: "Enter a valid due date." }, { status: 400 });
      return Response.json(await saveCommitment({ id: body.id ? String(body.id) : undefined, name, amountPence, normalAmountPence, dueDate: dueDate || null, timing: String(body.timing ?? ""), frequency: String(body.frequency ?? "monthly"), reserved: Boolean(body.reserved), active: body.active !== false }));
    }
    if (action === "update-settings") {
      const nextPayDate = String(body.nextPayDate ?? ""); if (nextPayDate && !isIsoDate(nextPayDate)) return Response.json({ error: "Enter a valid pay date." }, { status: 400 }); return Response.json(await updateNextPayDate(nextPayDate || null));
    }
    if (action === "csv-preview" || action === "csv-commit") {
      const raw = Array.isArray(body.records) ? body.records.slice(0, 2000) : [];
      const records: CsvRecord[] = raw.map((item) => { const row = item as Record<string, unknown>; return { date: String(row.date ?? "").trim(), amountPence: Number(row.amountPence), description: String(row.description ?? "").trim().slice(0, 240) }; }).filter((row) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row.date) && Number.isInteger(row.amountPence) && row.amountPence !== 0 && Math.abs(row.amountPence) <= 100_000_000 && row.description.length > 0);
      if (!records.length) return Response.json({ error: "No valid bank transactions were found." }, { status: 400 });
      return Response.json(await importCsv(records, action === "csv-commit"));
    }
    return Response.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("finance POST failed", error);
    const message = error instanceof Error && error.message === "Bill not found." ? error.message : "The update could not be saved. Your entered data is unchanged.";
    return Response.json({ error: message }, { status: error instanceof Error && error.message === "Bill not found." ? 404 : 500 });
  }
}
