import { AlertCircle, CheckCircle2, Info, RotateCcw, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { CapabilityArtifact, RunOutcome } from '@/lib/api';
import { formatCapabilityId } from '@/lib/utils';

const REDACTED_DISPLAY = '••••••••';

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface StatusMeta {
  label: string;
  icon: typeof CheckCircle2;
  badgeClassName: string;
  panelClassName: string;
}

function statusMeta(status: RunOutcome['result']['status']): StatusMeta {
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

interface ResultViewProps {
  artifact: CapabilityArtifact;
  outcome: RunOutcome;
  onRunAgain: () => void;
  onChooseDifferent: () => void;
}

export function ResultView({ artifact, outcome, onRunAgain, onChooseDifferent }: ResultViewProps) {
  const { result, log, screenshotDataUrl } = outcome;
  const meta = statusMeta(result.status);
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={onChooseDifferent}
          className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 text-sm"
        >
          <Undo2 className="size-3.5" />
          Back
        </button>
        <h2 className="text-base font-semibold">{formatCapabilityId(artifact.capabilityId)}</h2>
        <p className="text-muted-foreground font-mono text-xs">{artifact.capabilityId}</p>
      </div>

      {/* result.status, rendered distinctly per state -- this three-way
          distinction is the entire point of the artifact schema
          (CONSOLE_BUILD_SPEC.md §5). */}
      <Card className={meta.panelClassName}>
        <CardContent className="flex items-center gap-3">
          <Icon className="size-6 shrink-0" />
          <div className="flex flex-col gap-1">
            <Badge className={meta.badgeClassName || undefined} variant={meta.badgeClassName ? undefined : 'destructive'}>
              {meta.label}
            </Badge>
            {result.status === 'business_outcome' && (
              <span className="text-sm font-medium">{result.outcome}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {result.status === 'success' && (
        <OutputsList
          title="Outputs"
          entries={Object.entries(result.outputs)}
          specs={artifact.outputs}
        />
      )}

      {result.status === 'business_outcome' && (
        <OutputsList
          title="Outputs"
          entries={Object.entries(result.outputs)}
          specs={artifact.businessOutcomes.find((bo) => bo.name === result.outcome)?.outputs ?? []}
        />
      )}

      {result.status === 'failure' && (
        <div className="flex flex-col gap-3 text-sm">
          <FailureRow label="Step" value={result.stepId} />
          <FailureRow label="Expected" value={result.expected} />
          <FailureRow label="Observed" value={result.observed} />
        </div>
      )}

      {screenshotDataUrl && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Screenshot
          </p>
          <img
            src={screenshotDataUrl}
            alt="Final page state"
            className="w-full rounded-md border"
          />
        </div>
      )}

      <details className="rounded-md border">
        <summary className="text-muted-foreground cursor-pointer px-4 py-2 text-sm font-medium select-none">
          Step log ({log.length})
        </summary>
        <Separator />
        <ScrollArea className="max-h-64">
          <div className="flex flex-col gap-2 px-4 py-1 font-mono text-xs">
            {log.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{entry.stepId}</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </details>

      <div className="flex gap-3">
        <Button onClick={onRunAgain}>
          <RotateCcw className="size-4" />
          Run again
        </Button>
        <Button variant="outline" onClick={onChooseDifferent}>
          Choose different artifact
        </Button>
      </div>
    </div>
  );
}

function FailureRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="font-mono text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function OutputsList({
  title,
  entries,
  specs
}: {
  title: string;
  entries: [string, unknown][];
  specs: { name: string; description: string; sensitive: boolean }[];
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">{title}</p>
      <div className="flex flex-col gap-3">
        {entries.map(([name, value]) => {
          const spec = specs.find((s) => s.name === name);
          return (
            <div key={name} className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{spec?.description ?? name}</span>
              <span className="font-mono text-sm">
                {spec?.sensitive ? REDACTED_DISPLAY : formatValue(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
