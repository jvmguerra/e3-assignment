"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useOrgStore } from "@/stores/org-store";
import type { RecurringCadence } from "@/types/index";

export function RecurringForm() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [cadence, setCadence] = React.useState<RecurringCadence>("monthly");
  const [dayOfMonth, setDayOfMonth] = React.useState("1");
  const [category, setCategory] = React.useState("subscription");
  const [startDate, setStartDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  function reset() {
    setLabel("");
    setAmount("");
    setCurrency("USD");
    setCadence("monthly");
    setDayOfMonth("1");
    setCategory("subscription");
    setStartDate(new Date().toISOString().slice(0, 10));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    const parsedAmount = Number(amount);
    if (!isFinite(parsedAmount)) {
      toast.error("Amount must be a number");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-org-id": activeOrgId },
        body: JSON.stringify({
          label: label.trim(),
          amount: parsedAmount,
          currency: currency.toUpperCase(),
          cadence,
          day_of_month: cadence === "monthly" ? Number(dayOfMonth) : null,
          start_date: startDate,
          category,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success("Recurring entry added");
      queryClient.invalidateQueries({ queryKey: ["finance", "recurring"] });
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!activeOrgId}>
        <PlusIcon className="size-4" />
        Add fixed spending
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add fixed spending</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Rent, Netflix, etc."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Cadence</Label>
                <Select
                  value={cadence}
                  onValueChange={(v) => setCadence(v as RecurringCadence)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cadence === "monthly" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dom">Day of month</Label>
                  <Input
                    id="dom"
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat">Category</Label>
                <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start">Start date</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
