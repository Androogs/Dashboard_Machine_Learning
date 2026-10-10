/**
 * Estado del dashboard de PRESUPUESTO (EJECUCIÓN PRESUPUESTAL).
 * Separado del useAppStore (que maneja reportes de ventas).
 */
import { create } from 'zustand';
import type { BudgetDocument } from '@/types/budget';
import { parseBudgetFile } from '@/lib/budgetParser';

interface BudgetState {
  doc: BudgetDocument | null;
  loading: boolean;
  error: string | null;
  load: (file: File) => Promise<void>;
  reset: () => void;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  doc: null,
  loading: false,
  error: null,
  load: async (file) => {
    set({ loading: true, error: null });
    try {
      const doc = await parseBudgetFile(file);
      (window as any).__budgetDoc = doc;
      set({ doc, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },
  reset: () => set({ doc: null, error: null }),
}));