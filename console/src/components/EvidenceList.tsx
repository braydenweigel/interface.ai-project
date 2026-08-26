import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { EvidenceRunSummary } from '@/lib/api';
import { statusMeta } from '@/lib/status';
import { formatCapabilityId } from '@/lib/utils';

interface EvidenceListProps {
  entries: EvidenceRunSummary[];
  loading: boolean;
  error: string | null;
  onSelect: (entry: EvidenceRunSummary) => void;
}

export function EvidenceList({ entries, loading, error, onSelect }: EvidenceListProps) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => e.capabilityId.toLowerCase().includes(needle));
  }, [entries, filter]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading run history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive flex items-center gap-2 text-sm">
        <AlertTriangle className="size-4" />
        Failed to list evidence: {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No runs yet — results will appear here after you run an artifact.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by capability ID…"
        aria-label="Filter run history by capability ID"
      />

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs match "{filter}".</p>
      ) : (
        filtered.map((entry) => {
          const meta = statusMeta(entry.status);
          const Icon = meta.icon;
          return (
            <Card
              key={entry.runDir}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(entry)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(entry);
              }}
              className="hover:border-primary/50 cursor-pointer transition-colors"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {formatCapabilityId(entry.capabilityId)}
                  <span className="text-muted-foreground font-normal">v{entry.capabilityVersion}</span>
                </CardTitle>
                <p className="text-muted-foreground text-sm">
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                <p className="text-muted-foreground font-mono text-xs">{entry.capabilityId}</p>
                <CardAction className="flex items-center gap-2">
                  <Badge
                    className={meta.badgeClassName || undefined}
                    variant={meta.badgeClassName ? undefined : 'destructive'}
                  >
                    <Icon className="size-3" />
                    {meta.label}
                  </Badge>
                  <ChevronRight className="text-muted-foreground size-4" />
                </CardAction>
              </CardHeader>
            </Card>
          );
        })
      )}
    </div>
  );
}
