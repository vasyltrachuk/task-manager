'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbBillingPlan, mapDbInvoice, mapDbPayment, mapDbPaymentAllocation } from '../mappers';
import type { BillingPlan, Invoice, Payment, PaymentAllocation } from '../types';

export function useBillingPlans() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<BillingPlan[]>({
    queryKey: queryKeys.billingPlans.all,
    queryFn: async (): Promise<BillingPlan[]> => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('*, client:clients(*)')
        .order('created_at');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbBillingPlan(row));
    },
  });
}

export function useInvoices() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Invoice[]>({
    queryKey: queryKeys.invoices.all,
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          client:clients (*),
          billing_plan:billing_plans (*),
          payment_allocations (*)
        `)
        .order('issued_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbInvoice(row));
    },
  });
}

export function usePayments() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.all,
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, client:clients(*)')
        .order('paid_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbPayment(row));
    },
  });
}

export function usePaymentAllocations() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<PaymentAllocation[]>({
    queryKey: queryKeys.paymentAllocations.all,
    queryFn: async (): Promise<PaymentAllocation[]> => {
      const { data, error } = await supabase
        .from('payment_allocations')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map(mapDbPaymentAllocation);
    },
  });
}
