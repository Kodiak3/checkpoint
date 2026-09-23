import { getFinanceSnapshot, isIsoDate, recordTransaction, saveCommitment } from "../../lib/finance";

export const runtime = "edge";

const tools = [
  {
    name: "read_finance_checkpoint", title: "Read finance checkpoint",
    description: "Read the current available balance, reserved commitments, safe-to-spend amount, next pay date, and today's date. Does not modify data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_finance_commitments", title: "List finance commitments",
    description: "List recurring commitments with amount, due date, frequency, reserve and posted status. Does not modify data.",
    inputSchema: { type: "object", properties: { activeOnly: { type: "boolean", description: "Return active commitments only; defaults to true." } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_finance_transactions", title: "List finance transactions",
    description: "List the most recent tracker transactions. Does not modify data.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100, description: "Number of recent transactions; defaults to 20." } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "record_finance_transaction", title: "Record finance transaction",
    description: "Record confirmed income or spending and update the tracker balance. This changes tracker data but cannot move money.",
    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["income", "spending"] }, amountPence: { type: "integer", minimum: 1, maximum: 100000000 }, description: { type: "string", minLength: 1, maxLength: 120 }, date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, category: { type: "string", enum: ["Everyday spending", "Income", "Subscriptions & bills", "Transport", "Health", "Transfers", "Other"] } }, required: ["type", "amountPence", "description"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "update_finance_commitment", title: "Add or update finance commitment",
    description: "Add a commitment or edit its name, amounts, due date, frequency, note and reserve status. Supplying an id updates that commitment. Does not post the bill or change the bank balance.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string", minLength: 1, maxLength: 80 }, amountPence: { type: "integer", minimum: 1, maximum: 100000000 }, normalAmountPence: { type: "integer", minimum: 1, maximum: 100000000 }, dueDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, frequency: { type: "string", enum: ["weekly", "monthly", "quarterly", "yearly", "one-off"] }, timing: { type: "string", maxLength: 120 }, reserved: { type: "boolean" }, active: { type: "boolean" } }, required: ["name", "amountPence"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

function result(data: unknown) { return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data }; }
function error(message: string) { return { content: [{ type: "text", text: message }], isError: true }; }

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "read_finance_checkpoint") {
    const snapshot = await getFinanceSnapshot(); const reservedBills = snapshot.bills.filter((bill) => bill.active && bill.reserved); const reservedPence = reservedBills.reduce((sum, bill) => sum + bill.amountPence, 0);
    return result({ today: new Date().toISOString().slice(0, 10), balancePence: snapshot.state.balancePence, reservedPence, safeToSpendPence: snapshot.state.balancePence - reservedPence, anchorDate: snapshot.state.anchorDate, nextPayDate: snapshot.state.nextPayDate, billsDue: reservedBills.map(({ id, name, amountPence, dueDate }) => ({ id, name, amountPence, dueDate })) });
  }
  if (name === "list_finance_commitments") {
    const snapshot = await getFinanceSnapshot(); const activeOnly = args.activeOnly !== false;
    return result({ today: new Date().toISOString().slice(0, 10), commitments: snapshot.bills.filter((bill) => !activeOnly || bill.active).map(({ id, name, amountPence, normalAmountPence, dueDate, frequency, timing, status, reserved, active }) => ({ id, name, amountPence, normalAmountPence, dueDate, frequency, timing, status, reserved, active })) });
  }
  if (name === "list_finance_transactions") {
    const limit = Number.isInteger(args.limit) ? Math.max(1, Math.min(100, Number(args.limit))) : 20; const snapshot = await getFinanceSnapshot(limit);
    return result({ transactions: snapshot.transactions.slice(0, limit) });
  }
  if (name === "record_finance_transaction") {
    const type = String(args.type ?? ""); const amountPence = Number(args.amountPence); const description = String(args.description ?? "").trim(); const date = args.date ? String(args.date) : undefined;
    if (!["income", "spending"].includes(type) || !Number.isInteger(amountPence) || amountPence <= 0 || !description || (date && !isIsoDate(date))) return error("Valid type, positive amountPence, description and optional ISO date are required.");
    const snapshot = await recordTransaction({ amountPence: type === "income" ? amountPence : -amountPence, description, date, category: args.category ? String(args.category) : undefined, source: "mcp" }); const reservedPence = snapshot.bills.filter((bill) => bill.active && bill.reserved).reduce((sum, bill) => sum + bill.amountPence, 0);
    return result({ saved: true, balancePence: snapshot.state.balancePence, safeToSpendPence: snapshot.state.balancePence - reservedPence });
  }
  if (name === "update_finance_commitment") {
    const nameValue = String(args.name ?? "").trim(); const amountPence = Number(args.amountPence); const dueDate = args.dueDate == null ? null : String(args.dueDate);
    if (!nameValue || !Number.isInteger(amountPence) || amountPence <= 0 || (dueDate && !isIsoDate(dueDate))) return error("A name, positive amountPence and optional ISO dueDate are required.");
    const snapshot = await saveCommitment({ id: args.id ? String(args.id) : undefined, name: nameValue, amountPence, normalAmountPence: args.normalAmountPence == null ? amountPence : Number(args.normalAmountPence), dueDate, frequency: args.frequency ? String(args.frequency) : "monthly", timing: args.timing ? String(args.timing) : "", reserved: Boolean(args.reserved), active: args.active !== false });
    return result({ saved: true, commitment: snapshot.bills.find((bill) => args.id ? bill.id === String(args.id) : bill.name === nameValue) });
  }
  return error(`Unknown tool: ${name}`);
}

export async function POST(request: Request) {
  let payload: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try { payload = await request.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  if (payload.method === "notifications/initialized") return new Response(null, { status: 202 });
  const id = payload.id ?? null;
  try {
    if (payload.method === "initialize") return Response.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "Finance Checkpoint", version: "1.0.0" } } });
    if (payload.method === "ping") return Response.json({ jsonrpc: "2.0", id, result: {} });
    if (payload.method === "tools/list") return Response.json({ jsonrpc: "2.0", id, result: { tools } });
    if (payload.method === "tools/call") { const params = payload.params ?? {}; return Response.json({ jsonrpc: "2.0", id, result: await callTool(String(params.name ?? ""), (params.arguments ?? {}) as Record<string, unknown>) }); }
    return Response.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }, { status: 404 });
  } catch (caught) { console.error("MCP request failed", caught); return Response.json({ jsonrpc: "2.0", id, error: { code: -32603, message: "The finance tool request failed." } }, { status: 500 }); }
}

export async function GET() { return Response.json({ name: "Finance Checkpoint MCP", transport: "streamable-http", endpoint: "/mcp" }); }
