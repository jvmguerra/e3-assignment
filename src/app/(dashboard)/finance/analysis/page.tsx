"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SparklesIcon, Loader2, AlertTriangleIcon, InfoIcon, AlertCircleIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import { MonthPicker, currentMonthIso } from "@/components/finance/month-picker";
import type {
  FinanceAnalysis,
  FinanceTransferChain,
} from "@/types/index";
import type { MonthAggregates } from "@/lib/finance/aggregate";

const PRESETS: { key: string; label: string }[] = [
  { key: "cut_expenses", label: "Where can I cut expenses?" },
  { key: "subscriptions_audit", label: "Audit my subscriptions" },
  { key: "month_over_month", label: "Month-over-month comparison" },
  { key: "anomaly_detection", label: "Anomaly detection" },
  { key: "cashflow_summary", label: "Cash-flow summary" },
];

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CurrencyTotals({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-col gap-1">
            {entries.map(([c, v]) => (
              <div key={c} className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">{c}</span>
                <span className="text-lg font-semibold tabular-nums">
                  {v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FindingIcon({ severity }: { severity: "info" | "warn" | "critical" }) {
  if (severity === "critical") return <AlertCircleIcon className="size-4 text-destructive" />;
  if (severity === "warn") return <AlertTriangleIcon className="size-4 text-amber-500" />;
  return <InfoIcon className="size-4 text-muted-foreground" />;
}

export default function FinanceAnalysisPage() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();

  const initialMonth = params.get("month") ?? currentMonthIso();
  const [month, setMonth] = React.useState<string>(initialMonth);
  const [freeform, setFreeform] = React.useState("");

  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set("month", month);
    router.replace(`/finance/analysis?${q.toString()}`);
  }, [month, router]);

  const summaryQuery = useQuery({
    queryKey: ["finance", "summary", activeOrgId, month],
    queryFn: () =>
      apiFetch(`/api/finance/summary?month=${encodeURIComponent(month)}`, { headers }),
    enabled: !!activeOrgId,
  });

  const analysesQuery = useQuery({
    queryKey: ["finance", "analyses", activeOrgId, month],
    queryFn: () =>
      apiFetch(`/api/finance/analysis?month=${encodeURIComponent(month)}`, { headers }),
    enabled: !!activeOrgId,
  });

  const mutation = useMutation({
    mutationFn: async (body: { kind: "preset" | "freeform"; presetKey?: string; prompt?: string }) =>
      apiFetch("/api/finance/analysis", {
        method: "POST",
        headers,
        body: JSON.stringify({ month, ...body }),
      }),
    onSuccess: () => {
      toast.success("Analysis ready");
      queryClient.invalidateQueries({ queryKey: ["finance", "analyses"] });
      setFreeform("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    },
  });

  const aggregates = summaryQuery.data?.aggregates as MonthAggregates | undefined;
  const chains: FinanceTransferChain[] = summaryQuery.data?.chains ?? [];
  const analyses: FinanceAnalysis[] = analysesQuery.data?.analyses ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analysis</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered insights into spending, income, and inter-account transfers.
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Aggregates */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryQuery.isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          <>
            <CurrencyTotals title="Income" map={aggregates?.income_by_currency ?? {}} />
            <CurrencyTotals title="Expenses" map={aggregates?.expenses_by_currency ?? {}} />
            <CurrencyTotals title="Transfer fees lost" map={aggregates?.fees_by_currency ?? {}} />
            <CurrencyTotals title="Net" map={aggregates?.net_by_currency ?? {}} />
          </>
        )}
      </div>

      {/* Transfer chains panel */}
      {chains.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detected transfer chains</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {chains.map((c) => {
                const rateEntries = Object.entries(c.effective_rate);
                return (
                  <div key={c.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">
                        {c.leg_transaction_ids.length / 2} hop
                        {c.leg_transaction_ids.length / 2 === 1 ? "" : "s"}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span>
                        Landed:{" "}
                        <span className="font-mono">
                          {c.net_landed_amount !== null && c.net_landed_currency
                            ? formatAmount(c.net_landed_amount, c.net_landed_currency)
                            : "—"}
                        </span>
                      </span>
                      {rateEntries.length > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs">
                            Effective rate{" "}
                            {rateEntries.map(([k, v]) => (
                              <span key={k} className="font-mono">
                                {k.replace("_to_", "→")} {v.toFixed(4)}
                              </span>
                            ))}
                          </span>
                        </>
                      )}
                    </div>
                    {Object.entries(c.total_fees_by_currency).length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Lost to fees:{" "}
                        {Object.entries(c.total_fees_by_currency)
                          .map(([cur, v]) => formatAmount(Number(v), cur))
                          .join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unmatched transfer warning */}
      {aggregates &&
        Object.keys(aggregates.unmatched_transfers_by_currency).length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangleIcon className="size-4 mt-0.5 text-amber-500" />
              <div className="flex-1 text-sm">
                <p className="font-medium">Unmatched transfer legs detected</p>
                <p className="text-muted-foreground">
                  Upload the destination account&apos;s statement so transfers don&apos;t leak
                  into expense totals.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ask the AI</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ kind: "preset", presetKey: p.key })}
              >
                {mutation.isPending && <Loader2 className="size-3 animate-spin" />}
                <SparklesIcon className="size-3" />
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Textarea
              placeholder="Or ask anything: 'What's my biggest weekday vs weekend spending difference?'"
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              rows={3}
            />
            <div>
              <Button
                onClick={() =>
                  mutation.mutate({ kind: "freeform", prompt: freeform.trim() })
                }
                disabled={mutation.isPending || !freeform.trim()}
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Run analysis
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Past analyses */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Results
        </h2>
        {analysesQuery.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No analyses yet. Run a preset or ask a custom question above.
          </p>
        ) : (
          analyses.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <SparklesIcon className="size-4" />
                  {a.prompt_kind === "preset"
                    ? PRESETS.find((p) => p.key === a.prompt_key)?.label ?? a.prompt_key
                    : a.prompt_text ?? "Custom analysis"}
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {new Date(a.created_at).toLocaleString()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm">{a.result.overview}</p>

                {a.result.findings.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Findings
                    </h3>
                    {a.result.findings.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <FindingIcon severity={f.severity} />
                        <div>
                          <p className="font-medium">{f.title}</p>
                          <p className="text-muted-foreground">{f.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {a.result.suggestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Suggestions
                    </h3>
                    {a.result.suggestions.map((s, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-sm">
                        <p>{s.action}</p>
                        {s.estimated_savings !== null && s.currency && (
                          <Badge variant="secondary" className="shrink-0">
                            ~{formatAmount(s.estimated_savings, s.currency)}/mo
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
