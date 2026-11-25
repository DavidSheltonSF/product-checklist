import { colors } from './theme';
import type { CollectionEntry } from './db';

export type Status = 'collected' | 'partial' | 'pending' | 'absent';

export function deriveStatus(i: Pick<CollectionEntry, 'requested_qty' | 'found_qty' | 'marked_absent'>): Status {
  if (i.found_qty >= i.requested_qty) return 'collected';
  if (i.found_qty > 0) return 'partial';
  return i.marked_absent ? 'absent' : 'pending';
}

export const statusInfo: Record<Status, { label: string; color: string }> = {
  collected: { label: 'Encontrado', color: '#3BA776' },
  partial: { label: 'Parcial', color: '#E0A030' },
  pending: { label: 'Pendente', color: colors.muted },
  absent: { label: 'Não encontrado', color: colors.danger },
};
