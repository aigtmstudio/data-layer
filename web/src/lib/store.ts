'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppStore {
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      selectedClientId: null,
      setSelectedClientId: (id) => set({ selectedClientId: id }),
    }),
    {
      name: 'data-layer-store',
    },
  ),
);
