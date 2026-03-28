import { create } from 'zustand'
import type { KafkaConcept } from '../engine/types'
import { nanoid } from 'nanoid'

export type EntityType = 'producer' | 'consumer' | 'topic' | 'broker' | 'partition'

export interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  createdAt: number
}

interface UIStoreState {
  selectedEntityId: string | null
  selectedEntityType: EntityType | null
  activeControlTab: string
  isMetricsPanelExpanded: boolean
  isHintPanelOpen: boolean
  activeConceptCard: KafkaConcept | null
  toasts: Toast[]

  selectEntity(id: string, type: EntityType): void
  clearSelection(): void
  setActiveControlTab(tab: string): void
  toggleMetricsPanel(): void
  setHintPanelOpen(open: boolean): void
  showToast(message: string, type: Toast['type']): void
  dismissToast(id: string): void
  showConceptCard(concept: KafkaConcept): void
  dismissConceptCard(): void
}

export const useUIStore = create<UIStoreState>((set) => ({
  selectedEntityId: null,
  selectedEntityType: null,
  activeControlTab: 'topic',
  isMetricsPanelExpanded: true,
  isHintPanelOpen: false,
  activeConceptCard: null,
  toasts: [],

  selectEntity: (id, type) => set({ selectedEntityId: id, selectedEntityType: type }),
  clearSelection: () => set({ selectedEntityId: null, selectedEntityType: null }),
  setActiveControlTab: (tab) => set({ activeControlTab: tab }),
  toggleMetricsPanel: () => set((s) => ({ isMetricsPanelExpanded: !s.isMetricsPanelExpanded })),
  setHintPanelOpen: (open) => set({ isHintPanelOpen: open }),

  showToast: (message, type) => {
    const toast: Toast = { id: nanoid(6), message, type, createdAt: Date.now() }
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast.id) }))
    }, 3500)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  showConceptCard: (concept) => set({ activeConceptCard: concept }),
  dismissConceptCard: () => set({ activeConceptCard: null }),
}))
