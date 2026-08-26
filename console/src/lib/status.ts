// Shared status -> label/icon/color mapping for a ReplayResult['status'],
// used by both the Run tab's ResultView and the Log tab's evidence list/
// detail view so the same three-way visual language (green success / blue
// business outcome / red failure) shows up identically in both places
// (build-specs/console/2_LOG_TAB_SPEC.md §1).
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReplayResult } from '@/lib/api';

export interface StatusMeta {
  label: string;
  icon: typeof CheckCircle2;
  badgeClassName: string;
  panelClassName: string;
}

export function statusMeta(status: ReplayResult['status']): StatusMeta {
  switch (status) {
    case 'success':
      return {
        label: 'Success',
        icon: CheckCircle2,
        badgeClassName: 'bg-success text-success-foreground border-transparent',
        panelClassName: 'border-success/40 bg-success/10'
      };
    case 'business_outcome':
      return {
        label: 'Business outcome',
        icon: Info,
        badgeClassName: 'bg-blue-500 text-white border-transparent dark:bg-blue-600',
        panelClassName: 'border-blue-500/40 bg-blue-500/10'
      };
    case 'failure':
      return {
        label: 'Failure',
        icon: AlertCircle,
        badgeClassName: '',
        panelClassName: 'border-destructive/40 bg-destructive/10'
      };
  }
}
