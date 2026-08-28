import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ArtifactListEntry, EvidenceRunSummary } from '@/lib/api';
import { statusMeta } from '@/lib/status';
import { cn, formatCapabilityId } from '@/lib/utils';

interface EvidenceListProps {
  entries: EvidenceRunSummary[];
  /** Every known artifact (not just ones with runs yet) -- the combobox
   * lists all of these so an operator can jump straight to an artifact
   * even before it has any run history. */
  artifacts: ArtifactListEntry[];
  loading: boolean;
  error: string | null;
  onSelect: (entry: EvidenceRunSummary) => void;
}

export function EvidenceList({ entries, artifacts, loading, error, onSelect }: EvidenceListProps) {
  const [open, setOpen] = useState(false);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);

  const capabilityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const artifact of artifacts) {
      if (!artifact.data) continue;
      if (!seen.has(artifact.data.capabilityId)) {
        seen.set(artifact.data.capabilityId, formatCapabilityId(artifact.data.capabilityId));
      }
    }
    return Array.from(seen.entries()).map(([capabilityId, label]) => ({ capabilityId, label }));
  }, [artifacts]);

  const filtered = useMemo(() => {
    if (!selectedCapabilityId) return entries;
    return entries.filter((e) => e.capabilityId === selectedCapabilityId);
  }, [entries, selectedCapabilityId]);

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

  const selectedLabel = selectedCapabilityId
    ? (capabilityOptions.find((o) => o.capabilityId === selectedCapabilityId)?.label ?? selectedCapabilityId)
    : 'All artifacts';

  return (
    <div className="flex flex-col gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selectedLabel}
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width)">
          <Command>
            <CommandInput placeholder="Search artifacts…" />
            <CommandList>
              <CommandEmpty>No artifacts found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all-artifacts"
                  onSelect={() => {
                    setSelectedCapabilityId(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('size-4', selectedCapabilityId === null ? 'opacity-100' : 'opacity-0')} />
                  All Artifacts
                </CommandItem>
                {capabilityOptions.map((option) => (
                  <CommandItem
                    key={option.capabilityId}
                    value={option.capabilityId}
                    onSelect={() => {
                      setSelectedCapabilityId(option.capabilityId);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'size-4',
                        selectedCapabilityId === option.capabilityId ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs for "{selectedLabel}" yet.</p>
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
