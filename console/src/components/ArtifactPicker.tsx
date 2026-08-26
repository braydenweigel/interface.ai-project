import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import type { ArtifactListEntry, RiskClass } from '@/lib/api';

function riskBadgeVariant(riskClass: RiskClass): 'secondary' | 'warning' | 'destructive' {
  if (riskClass === 'irreversible') return 'destructive';
  if (riskClass === 'reversible') return 'warning';
  return 'secondary';
}

interface ArtifactPickerProps {
  entries: ArtifactListEntry[];
  loading: boolean;
  error: string | null;
  onSelect: (entry: ArtifactListEntry) => void;
}

export function ArtifactPicker({ entries, loading, error, onSelect }: ArtifactPickerProps) {
  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading artifacts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive flex items-center gap-2 text-sm">
        <AlertTriangle className="size-4" />
        Failed to list artifacts: {error}
      </div>
    );
  }

  const usable = entries.filter((e) => e.data !== null);
  const broken = entries.filter((e) => e.data === null);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No artifacts found under <code>artifacts/</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {usable.map((entry) => (
        <Card
          key={entry.path}
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
              {entry.data!.capabilityId}
              <span className="text-muted-foreground font-normal">v{entry.data!.version}</span>
            </CardTitle>
            <CardDescription>{entry.data!.description}</CardDescription>
            <CardAction className="flex items-center gap-2">
              <Badge variant={riskBadgeVariant(entry.data!.riskClass)}>{entry.data!.riskClass}</Badge>
              <ChevronRight className="text-muted-foreground size-4" />
            </CardAction>
          </CardHeader>
        </Card>
      ))}

      {broken.length > 0 && (
        <div className="mt-2">
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Could not be parsed
          </p>
          {broken.map((entry) => (
            <Card key={entry.path} className="border-dashed opacity-70">
              <CardContent className="flex items-center gap-2 text-sm">
                <AlertTriangle className="text-destructive size-4 shrink-0" />
                <span className="truncate">{entry.path}</span>
                <span className="text-muted-foreground">— {entry.parseError}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
