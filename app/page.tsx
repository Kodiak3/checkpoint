"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, CircleDollarSign, Database, FileUp, Gauge, Loader2, LockKeyhole, Pencil, Plus, RefreshCw, Settings2, ShieldCheck, Terminal, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

type FinanceState = { id: number; balancePence: number; anchorDate: string; nextPayDate: string | null; updatedAt: string };
type Bill = { id: string; name: string; amountPence: number; normalAmountPence: number | null; timing: string; dueDate: string | null; frequency: string; status: string; reserved: boolean; active: boolean; sortOrder: number };
type Transaction = { id: string; sortDate: string; displayDate: string; amountPence: number; description: string; category: string; source: string; createdAt: string };
type Correction = { id: string; note: string; sortOrder: number };
type Snapshot = { state: FinanceState; bills: Bill[]; transactions: Transaction[]; corrections: Correction[] };
type CsvRecord = { date: string; amountPence: number; description: string };
type CsvSummary = { totalRows: number; newRows: number; duplicateRows: number; newIncomePence: number; newSpendingPence: number; netPence: number };
type WebMcpContext = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };

declare global {
  interface Document { modelContext?: WebMcpContext }
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (pence: number) => gbp.format(pence / 100);
const localIsoDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const displayDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "Date not set";
function dueLabel(bill: Bill, today: string) {
  if (bill.status === "paid") return bill.dueDate ? `Posted · ${displayDate(bill.dueDate)}` : "Posted · date not set";
  if (!bill.dueDate) return "Due · date not set";
  const days = Math.round((Date.parse(`${bill.dueDate}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86400000);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue · ${displayDate(bill.dueDate)}`;
  if (days === 0) return `Due today · ${displayDate(bill.dueDate)}`;
  if (days === 1) return `Due tomorrow · ${displayDate(bill.dueDate)}`;
  return `Due in ${days} days · ${displayDate(bill.dueDate)}`;
}

async function api<T = Snapshot>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/finance", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The request failed.");
  return payload;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current); current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

function parseBankCsv(text: string): CsvRecord[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("This CSV does not contain transaction rows.");
  const headers = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const amountIndex = headers.indexOf("amount");
  const memoIndex = headers.indexOf("memo");
  if (dateIndex < 0 || amountIndex < 0 || memoIndex < 0) throw new Error("Expected Date, Amount and Memo columns were not found.");
  return lines.slice(1).map(parseCsvLine).map((cells) => ({
    date: (cells[dateIndex] || "").trim(),
    amountPence: Math.round(Number((cells[amountIndex] || "0").trim()) * 100),
    description: cells.slice(memoIndex).join(",").replace(/\t+/g, " ").replace(/\s+/g, " ").trim(),
  })).filter((row) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row.date) && Number.isInteger(row.amountPence) && row.amountPence !== 0 && row.description);
}

function Metric({ label, value, detail, icon: Icon, accent = false }: { label: string; value: string; detail: string; icon: typeof Gauge; accent?: boolean }) {
  return <Card className={accent ? "metric-card metric-primary" : "metric-card"}>
    <CardHeader className="pb-0"><div className="flex items-center justify-between gap-4"><CardDescription className="metric-label">{label}</CardDescription><Icon className="size-4 text-primary" aria-hidden="true" /></div><CardTitle className="metric-value">{value}</CardTitle></CardHeader>
    <CardContent><p className="text-sm text-muted-foreground">{detail}</p></CardContent>
  </Card>;
}

export default function Home() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [transactionType, setTransactionType] = useState<"spend" | "income">("spend");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(localIsoDate);
  const [category, setCategory] = useState("Everyday spending");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileAmount, setReconcileAmount] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [csvRecords, setCsvRecords] = useState<CsvRecord[]>([]);
  const [csvSummary, setCsvSummary] = useState<CsvSummary | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billNormalAmount, setBillNormalAmount] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billFrequency, setBillFrequency] = useState("monthly");
  const [billTiming, setBillTiming] = useState("");
  const [billReserved, setBillReserved] = useState(true);
  const [billActive, setBillActive] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nextPayDate, setNextPayDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try { setError(""); setData(await api()); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load the checkpoint."); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);

    void register({
      name: "read_finance_checkpoint",
      title: "Read finance checkpoint",
      description: "Read the current tracker balance, reserved commitments, safe-to-spend figure and bills still due. This does not modify data.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => {
        const snapshot = await api() as Snapshot;
        const due = snapshot.bills.filter((bill) => bill.reserved);
        const reservedPence = due.reduce((sum, bill) => sum + bill.amountPence, 0);
        return { balancePence: snapshot.state.balancePence, reservedPence, safeToSpendPence: snapshot.state.balancePence - reservedPence, anchorDate: snapshot.state.anchorDate, billsDue: due.map((bill) => ({ id: bill.id, name: bill.name, amountPence: bill.amountPence })) };
      },
    });
    void register({
      name: "record_finance_transaction",
      title: "Record finance transaction",
      description: "Record a confirmed manual income or spending transaction in the finance tracker and update the visible checkpoint.",
      inputSchema: { type: "object", properties: { type: { type: "string", enum: ["income", "spending"] }, amountPence: { type: "integer", minimum: 1, maximum: 100000000 }, description: { type: "string", minLength: 1, maxLength: 120 } }, required: ["type", "amountPence", "description"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const value = input as { type?: string; amountPence?: number; description?: string };
        if (!Number.isInteger(value.amountPence) || !["income", "spending"].includes(value.type ?? "") || !value.description?.trim()) throw new Error("Valid type, amountPence and description are required.");
        const snapshot = await api({ action: "manual-transaction", amountPence: value.type === "income" ? value.amountPence : -value.amountPence!, description: value.description.trim() }) as Snapshot;
        setData(snapshot);
        const due = snapshot.bills.filter((bill) => bill.reserved).reduce((sum, bill) => sum + bill.amountPence, 0);
        return { saved: true, balancePence: snapshot.state.balancePence, safeToSpendPence: snapshot.state.balancePence - due };
      },
    });
    void register({
      name: "reconcile_finance_balance",
      title: "Reconcile finance balance",
      description: "Replace the tracker's available balance with a newly confirmed bank balance. This changes only the tracker and cannot move money.",
      inputSchema: { type: "object", properties: { balancePence: { type: "integer", minimum: 0, maximum: 100000000 } }, required: ["balancePence"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const value = input as { balancePence?: number };
        if (!Number.isInteger(value.balancePence) || value.balancePence! < 0) throw new Error("A valid balancePence is required.");
        const snapshot = await api({ action: "reconcile-balance", balancePence: value.balancePence }) as Snapshot;
        setData(snapshot);
        return { saved: true, balancePence: snapshot.state.balancePence, anchorDate: snapshot.state.anchorDate };
      },
    });
    return () => lifecycle.abort();
  }, []);

  const reserved = useMemo(() => data?.bills.filter((bill) => bill.active && bill.reserved).reduce((sum, bill) => sum + bill.amountPence, 0) ?? 0, [data]);
  const safe = (data?.state.balancePence ?? 0) - reserved;
  const safePercent = data?.state.balancePence ? Math.max(0, Math.min(100, safe / data.state.balancePence * 100)) : 0;
  const baseline = useMemo(() => data?.bills.filter((bill) => bill.active).reduce((sum, bill) => sum + (bill.normalAmountPence ?? bill.amountPence), 0) ?? 0, [data]);
  const today = localIsoDate();

  const runUpdate = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    try { setData(await api(body)); toast.success(success); }
    catch (err) { toast.error(err instanceof Error ? err.message : "The update failed."); }
    finally { setBusy(false); }
  };

  const addTransaction = async () => {
    const pence = Math.round(Number(amount) * 100);
    if (!Number.isFinite(pence) || pence <= 0) return toast.error("Enter an amount greater than £0.00.");
    await runUpdate({ action: "manual-transaction", amountPence: transactionType === "income" ? pence : -pence, description: description.trim() || (transactionType === "income" ? "Manual income" : "Manual spending"), date: transactionDate, category: transactionType === "income" ? "Income" : category }, "Checkpoint updated");
    setAmount(""); setDescription("");
  };

  const openEditor = (bill?: Bill) => {
    setEditingId(bill?.id ?? null); setBillName(bill?.name ?? ""); setBillAmount(bill ? String(bill.amountPence / 100) : ""); setBillNormalAmount(bill ? String((bill.normalAmountPence ?? bill.amountPence) / 100) : ""); setBillDueDate(bill?.dueDate ?? ""); setBillFrequency(bill?.frequency ?? "monthly"); setBillTiming(bill?.timing ?? ""); setBillReserved(bill?.reserved ?? true); setBillActive(bill?.active ?? true); setEditorOpen(true);
  };

  const saveBill = async () => {
    const amountPence = Math.round(Number(billAmount) * 100); const normalAmountPence = Math.round(Number(billNormalAmount || billAmount) * 100);
    if (!billName.trim() || amountPence <= 0 || normalAmountPence <= 0) return toast.error("Enter a name and valid amounts.");
    setBusy(true);
    try { setData(await api({ action: "save-commitment", id: editingId ?? undefined, name: billName, amountPence, normalAmountPence, dueDate: billDueDate, frequency: billFrequency, timing: billTiming, reserved: billReserved, active: billActive })); setEditorOpen(false); toast.success(editingId ? "Commitment updated" : "Commitment added"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Commitment could not be saved."); }
    finally { setBusy(false); }
  };

  const saveSettings = async () => {
    setBusy(true);
    try { setData(await api({ action: "update-settings", nextPayDate })); setSettingsOpen(false); toast.success("Planning date updated"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  };

  const reconcile = async () => {
    const pence = Math.round(Number(reconcileAmount) * 100);
    if (!Number.isFinite(pence) || pence < 0) return toast.error("Enter a valid bank balance.");
    setBusy(true);
    try { setData(await api({ action: "reconcile-balance", balancePence: pence })); setReconcileOpen(false); setReconcileAmount(""); toast.success("Bank balance reconciled"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Reconciliation failed."); }
    finally { setBusy(false); }
  };

  const chooseCsv = async (file?: File) => {
    if (!file) return;
    setBusy(true); setCsvSummary(null);
    try { const records = parseBankCsv(await file.text()); const summary = await api<CsvSummary>({ action: "csv-preview", records }); setCsvRecords(records); setCsvSummary(summary); }
    catch (err) { toast.error(err instanceof Error ? err.message : "The CSV could not be read."); setCsvRecords([]); }
    finally { setBusy(false); }
  };

  const commitCsv = async () => {
    setBusy(true);
    try {
      const result = await api<CsvSummary & { snapshot: Snapshot }>({ action: "csv-commit", records: csvRecords });
      setData(result.snapshot); toast.success(`${result.newRows} new transaction${result.newRows === 1 ? "" : "s"} imported`);
      setImportOpen(false); setCsvRecords([]); setCsvSummary(null); if (fileRef.current) fileRef.current.value = "";
    } catch (err) { toast.error(err instanceof Error ? err.message : "Import failed."); }
    finally { setBusy(false); }
  };

  if (!data && !error) return <main className="loading-screen"><Loader2 className="size-6 animate-spin text-primary" /><span>Initialising private ledger…</span></main>;
  if (!data) return <main className="loading-screen"><Database className="size-6 text-destructive" /><span>{error}</span><Button onClick={refresh}>Retry</Button></main>;

  return <main className="app-shell">
    <div className="scanlines" aria-hidden="true" />
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><Terminal className="size-5" aria-hidden="true" /></div><div><p className="eyebrow">CP // PRIVATE LEDGER</p><h1>Finance checkpoint</h1></div></div>
      <div className="top-actions">
        <Badge variant="outline" className="privacy-badge"><LockKeyhole /> Private</Badge>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild><Button variant="outline" onClick={() => setNextPayDate(data.state.nextPayDate ?? "")}><Settings2 /> Dates</Button></DialogTrigger>
          <DialogContent className="dialog-cyber">
            <DialogHeader><DialogTitle>Planning dates</DialogTitle><DialogDescription>Checkpoint uses today&apos;s real date for warnings. Set the next payday used in your planning readout.</DialogDescription></DialogHeader>
            <label className="field-label" htmlFor="next-pay-date">Next payday</label><Input id="next-pay-date" type="date" value={nextPayDate} onChange={(event) => setNextPayDate(event.target.value)} />
            <p className="text-sm text-muted-foreground">Dates never move money automatically. Posting a commitment is always an explicit action.</p>
            <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button onClick={saveSettings} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CalendarDays />} Save date</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild><Button variant="outline"><FileUp /> Import CSV</Button></DialogTrigger>
          <DialogContent className="dialog-cyber">
            <DialogHeader><DialogTitle>Import bank transactions</DialogTitle><DialogDescription>The file is parsed in your browser. Only validated transaction records are sent to this private tracker.</DialogDescription></DialogHeader>
            <Input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(event) => void chooseCsv(event.target.files?.[0])} />
            {busy && !csvSummary && <div className="import-state"><Loader2 className="size-4 animate-spin" /> Analysing CSV…</div>}
            {csvSummary && <div className="import-grid" aria-live="polite">
              <div><span>Valid rows</span><strong>{csvSummary.totalRows}</strong></div><div><span>New</span><strong>{csvSummary.newRows}</strong></div><div><span>Duplicates</span><strong>{csvSummary.duplicateRows}</strong></div>
              <div><span>New income</span><strong>{money(csvSummary.newIncomePence)}</strong></div><div><span>New spending</span><strong>{money(csvSummary.newSpendingPence)}</strong></div><div><span>Net movement</span><strong className={csvSummary.netPence < 0 ? "negative" : "positive"}>{money(csvSummary.netPence)}</strong></div>
            </div>}
            <p className="text-sm text-muted-foreground">Imports add history and detect duplicates. They do not overwrite the confirmed bank balance; use Reconcile balance after checking your banking app.</p>
            <DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={commitCsv} disabled={!csvSummary || csvSummary.newRows === 0 || busy}>{busy ? <Loader2 className="animate-spin" /> : <Database />} Import new rows</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
          <DialogTrigger asChild><Button><RefreshCw /> Reconcile balance</Button></DialogTrigger>
          <DialogContent className="dialog-cyber">
            <DialogHeader><DialogTitle>Set confirmed bank balance</DialogTitle><DialogDescription>Use the available balance shown by your bank after pending transactions have cleared.</DialogDescription></DialogHeader>
            <label className="field-label" htmlFor="reconcile">Available balance (£)</label><Input id="reconcile" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" value={reconcileAmount} onChange={(e) => setReconcileAmount(e.target.value)} />
            <DialogFooter><Button variant="outline" onClick={() => setReconcileOpen(false)}>Cancel</Button><Button onClick={reconcile} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Confirm balance</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>

    <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
      <DialogContent className="dialog-cyber bill-editor">
        <DialogHeader><DialogTitle>{editingId ? "Edit commitment" : "Add commitment"}</DialogTitle><DialogDescription>Update the planning record. This does not post a bill or move money.</DialogDescription></DialogHeader>
        <div className="form-grid">
          <div className="field-wide"><label className="field-label" htmlFor="bill-name">Name</label><Input id="bill-name" value={billName} onChange={(event) => setBillName(event.target.value)} placeholder="e.g. Council tax" /></div>
          <div><label className="field-label" htmlFor="bill-amount">This amount (£)</label><Input id="bill-amount" type="number" min="0.01" step="0.01" value={billAmount} onChange={(event) => setBillAmount(event.target.value)} /></div>
          <div><label className="field-label" htmlFor="bill-normal">Normal amount (£)</label><Input id="bill-normal" type="number" min="0.01" step="0.01" value={billNormalAmount} onChange={(event) => setBillNormalAmount(event.target.value)} /></div>
          <div><label className="field-label" htmlFor="bill-date">Due date</label><Input id="bill-date" type="date" value={billDueDate} onChange={(event) => setBillDueDate(event.target.value)} /></div>
          <div><label className="field-label" htmlFor="bill-frequency">Frequency</label><select id="bill-frequency" className="native-select" value={billFrequency} onChange={(event) => setBillFrequency(event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="one-off">One-off</option></select></div>
          <div className="field-wide"><label className="field-label" htmlFor="bill-note">Planning note</label><Input id="bill-note" value={billTiming} onChange={(event) => setBillTiming(event.target.value)} placeholder="Anything useful about this payment" /></div>
        </div>
        <div className="check-options"><label><Checkbox checked={billReserved} onCheckedChange={(value) => setBillReserved(Boolean(value))} /> Reserve this amount from safe to spend</label><label><Checkbox checked={billActive} onCheckedChange={(value) => setBillActive(Boolean(value))} /> Active commitment</label></div>
        <DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={saveBill} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Database />} Save commitment</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <section className="checkpoint-strip" aria-label="Checkpoint status"><div><span className="status-dot" />Reconciled checkpoint</div><span>Today: {displayDate(today)}</span><span>Next pay: {displayDate(data.state.nextPayDate)}</span><span>Anchor: {/^\d{4}-/.test(data.state.anchorDate) ? displayDate(data.state.anchorDate) : data.state.anchorDate}</span></section>
    <section className="metrics-grid" aria-label="Current finance summary"><Metric label="Available balance" value={money(data.state.balancePence)} detail="Confirmed bank position" icon={WalletCards} /><Metric label="Reserved" value={money(reserved)} detail={`${data.bills.filter((bill) => bill.active && bill.reserved).length} commitments still due`} icon={CircleDollarSign} /><Metric label="Safe to spend" value={money(safe)} detail="Balance after unpaid reserves" icon={Gauge} accent /></section>
    <section className="safe-meter" aria-label="Safe-to-spend meter"><div className="meter-copy"><span>Spendable capacity</span><span>{Math.round(safePercent)}% of current balance</span></div><Progress value={safePercent} /></section>

    <Tabs defaultValue="overview" className="content-tabs">
      <TabsList className="tabs-bar"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="commitments">Commitments</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="corrections">Corrections</TabsTrigger></TabsList>
      <TabsContent value="overview" className="panel-grid">
        <Card className="surface-card"><CardHeader><CardTitle>Still due</CardTitle><CardDescription>Reserved from the available balance</CardDescription></CardHeader><CardContent className="bill-list">
          {data.bills.filter((bill) => bill.active && bill.reserved).map((bill) => <div className="bill-row" key={bill.id}><Checkbox aria-label={`Mark ${bill.name} as posted`} checked={bill.status === "paid"} onCheckedChange={(checked) => void runUpdate({ action: "toggle-bill", id: bill.id, posted: Boolean(checked) }, `${bill.name} marked as posted`)} disabled={busy} /><div><strong>{bill.name}</strong><span className={bill.dueDate && bill.dueDate < today ? "overdue" : ""}>{dueLabel(bill, today)}</span><span>{bill.timing}</span></div><b>{money(bill.amountPence)}</b></div>)}
          {data.bills.filter((bill) => bill.active && bill.reserved).length === 0 && <div className="empty-inline">Nothing is currently reserved.</div>}
        </CardContent></Card>
        <Card className="surface-card quick-entry"><CardHeader><CardTitle>Quick update</CardTitle><CardDescription>Record spending, income or a refund</CardDescription></CardHeader><CardContent className="entry-form">
          <div className="type-switch" role="group" aria-label="Transaction type"><Button variant={transactionType === "spend" ? "default" : "outline"} onClick={() => setTransactionType("spend")}><ArrowDownRight /> Spending</Button><Button variant={transactionType === "income" ? "default" : "outline"} onClick={() => setTransactionType("income")}><ArrowUpRight /> Income</Button></div>
          <label className="field-label" htmlFor="quick-amount">Amount (£)</label><Input id="quick-amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="field-label" htmlFor="quick-note">Description</label><Input id="quick-note" placeholder="What changed?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="form-grid compact"><div><label className="field-label" htmlFor="quick-date">Date</label><Input id="quick-date" type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></div><div><label className="field-label" htmlFor="quick-category">Category</label><select id="quick-category" className="native-select" value={category} onChange={(event) => setCategory(event.target.value)}><option>Everyday spending</option><option>Subscriptions &amp; bills</option><option>Transport</option><option>Health</option><option>Transfers</option><option>Other</option></select></div></div>
          <Button onClick={addTransaction} disabled={busy} className="w-full">{busy ? <Loader2 className="animate-spin" /> : <Activity />} Apply to checkpoint</Button>
        </CardContent></Card>
        <Card className="surface-card intelligence-card"><CardHeader><CardTitle>System readout</CardTitle><CardDescription>Current planning logic</CardDescription></CardHeader><CardContent className="readout-list"><div><span>Standard recurring baseline</span><strong>{money(baseline)}</strong></div><div><span>Active planned total</span><strong>{money(data.bills.filter((bill) => bill.active).reduce((sum, bill) => sum + bill.amountPence, 0))}</strong></div><div><span>Next payday</span><strong>{displayDate(data.state.nextPayDate)}</strong></div><div><span>Recorded activity</span><strong>{data.transactions.length}</strong></div></CardContent></Card>
      </TabsContent>

      <TabsContent value="commitments"><Card className="surface-card"><CardHeader><div className="card-heading-row"><div><CardTitle>Recurring commitments</CardTitle><CardDescription>Editable amounts, dates, frequency and reserve status</CardDescription></div><Button onClick={() => openEditor()}><Plus /> Add commitment</Button></div></CardHeader><CardContent className="commitment-list">{data.bills.map((bill) => <div className={`commitment-row ${bill.active ? "" : "inactive"}`} key={bill.id}><div className="commitment-status"><Checkbox checked={bill.status === "paid"} aria-label={`Toggle ${bill.name}`} onCheckedChange={(checked) => void runUpdate({ action: "toggle-bill", id: bill.id, posted: Boolean(checked) }, `${bill.name} updated`)} disabled={busy || !bill.active} /><span className={bill.status === "paid" ? "posted" : "due"}>{bill.status === "paid" ? "Posted" : "Due"}</span></div><div><strong>{bill.name}</strong><span className={bill.status !== "paid" && bill.dueDate && bill.dueDate < today ? "overdue" : ""}>{dueLabel(bill, today)} · {bill.frequency}</span><span>{bill.timing || "No planning note"}{!bill.active ? " · inactive" : ""}</span></div><div className="amount-block"><b>{money(bill.amountPence)}</b>{bill.normalAmountPence !== bill.amountPence && <span>normally {money(bill.normalAmountPence ?? bill.amountPence)}</span>}<Button variant="ghost" size="sm" onClick={() => openEditor(bill)}><Pencil /> Edit</Button></div></div>)}</CardContent></Card></TabsContent>

      <TabsContent value="activity"><Card className="surface-card"><CardHeader><CardTitle>Activity log</CardTitle><CardDescription>Manual updates and imported bank transactions</CardDescription></CardHeader><CardContent className="activity-list">{data.transactions.length === 0 ? <div className="empty-state"><Database /><strong>No activity imported yet</strong><span>Import a bank CSV or record a quick update.</span></div> : data.transactions.map((item) => <div className="activity-row" key={item.id}><div className={item.amountPence >= 0 ? "activity-icon positive" : "activity-icon negative"}>{item.amountPence >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}</div><div><strong>{item.description}</strong><span>{item.displayDate} · {item.category} · {item.source.toUpperCase()}</span></div><b className={item.amountPence >= 0 ? "positive" : "negative"}>{item.amountPence > 0 ? "+" : ""}{money(item.amountPence)}</b></div>)}</CardContent></Card></TabsContent>

      <TabsContent value="corrections"><Card className="surface-card"><CardHeader><CardTitle>Protected corrections</CardTitle><CardDescription>Context that must survive every recalculation</CardDescription></CardHeader><CardContent className="correction-list">{data.corrections.map((item) => <div key={item.id}><CheckCircle2 aria-hidden="true" /><span>{item.note}</span></div>)}</CardContent></Card></TabsContent>
    </Tabs>
    <footer><ShieldCheck aria-hidden="true" /> Owner-private · durable storage · no payment capability</footer>
    <Toaster position="bottom-center" richColors />
  </main>;
}
