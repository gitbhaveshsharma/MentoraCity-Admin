"use client";
import { create } from "zustand";
import { CoachingBranch, CoachingCenter, SeoPayload } from "@/lib/types";

type SeoStore = { center: CoachingCenter | null; branches: CoachingBranch[]; activeEdit: "center" | "branch" | null; pendingUpdates: Record<string, Partial<SeoPayload>>; isSaving: boolean; setCenter: (center: CoachingCenter) => void; setBranches: (branches: CoachingBranch[]) => void; applyOptimisticUpdate: (id: string, patch: Partial<SeoPayload>) => void; revertOptimisticUpdate: (id: string) => void; setIsSaving: (value: boolean) => void; };

export const useSeoStore = create<SeoStore>((set) => ({ center: null, branches: [], activeEdit: null, pendingUpdates: {}, isSaving: false,
  setCenter: (center) => set({ center }), setBranches: (branches) => set({ branches }),
  applyOptimisticUpdate: (id, patch) => set((state) => ({ pendingUpdates: { ...state.pendingUpdates, [id]: { ...state.pendingUpdates[id], ...patch } } })),
  revertOptimisticUpdate: (id) => set((state) => { const next = { ...state.pendingUpdates }; delete next[id]; return { pendingUpdates: next }; }), setIsSaving: (isSaving) => set({ isSaving }),
}));
