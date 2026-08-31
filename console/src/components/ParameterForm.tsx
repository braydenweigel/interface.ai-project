import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { CapabilityArtifact, ParamSpec } from '@/lib/api';

type FieldValue = string | boolean;

function initialValues(parameters: ParamSpec[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const spec of parameters) {
    values[spec.name] = spec.type === 'boolean' ? false : '';
  }
  return values;
}

function inputTypeFor(spec: ParamSpec): string {
  if (spec.sensitive) return 'password';
  if (spec.type === 'number' || spec.type === 'currency') return 'number';
  if (spec.type === 'date') return 'date';
  return 'text';
}

interface ParameterFormProps {
  artifact: CapabilityArtifact;
  running: boolean;
  error: string | null;
  onBack: () => void;
  onRun: (params: Record<string, string | number | boolean>) => void;
}

export function ParameterForm({ artifact, running, error, onBack, onRun }: ParameterFormProps) {
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(artifact.parameters));

  const missingRequired = artifact.parameters.filter((spec) => {
    if (!spec.required) return false;
    const value = values[spec.name];
    return typeof value === 'string' ? value.trim() === '' : false;
  });
  const canRun = missingRequired.length === 0 && !running;

  function setValue(name: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canRun) return;

    // Omit blank optional string/number/date fields rather than sending
    // "" -- matches run()'s own params: Record<string, ...> = {}
    // default-omission behavior (build-specs/console/1_CONSOLE_SPEC.md §4).
    const params: Record<string, string | number | boolean> = {};
    for (const spec of artifact.parameters) {
      const value = values[spec.name];
      if (typeof value === 'string' && value.trim() === '' && !spec.required) continue;
      params[spec.name] = value;
    }
    onRun(params);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-3.5" />
          Back to artifacts
        </button>
        <h2 className="text-base font-semibold">{artifact.capabilityId}</h2>
        <p className="text-muted-foreground text-sm">{artifact.description}</p>
      </div>

      <Separator />

      <div className="flex flex-col gap-5">
        {artifact.parameters.map((spec) => (
          <div key={spec.name} className="flex flex-col gap-1.5">
            {spec.type === 'boolean' ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={spec.name}
                  checked={values[spec.name] === true}
                  onCheckedChange={(checked) => setValue(spec.name, checked === true)}
                />
                <Label htmlFor={spec.name}>
                  {spec.name}
                  {spec.required && <span className="text-destructive">*</span>}
                </Label>
              </div>
            ) : spec.allowedValues && spec.allowedValues.length > 0 ? (
              <>
                <Label htmlFor={spec.name}>
                  {spec.name}
                  {spec.required && <span className="text-destructive">*</span>}
                </Label>
                <Select
                  value={typeof values[spec.name] === 'string' ? (values[spec.name] as string) : ''}
                  onValueChange={(value) => setValue(spec.name, value)}
                >
                  <SelectTrigger id={spec.name}>
                    <SelectValue placeholder={spec.required ? 'required' : 'optional'} />
                  </SelectTrigger>
                  <SelectContent>
                    {spec.allowedValues.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <Label htmlFor={spec.name}>
                  {spec.name}
                  {spec.required && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={spec.name}
                  type={inputTypeFor(spec)}
                  autoComplete="off"
                  value={typeof values[spec.name] === 'string' ? (values[spec.name] as string) : ''}
                  onChange={(e) => setValue(spec.name, e.target.value)}
                  placeholder={spec.required ? 'required' : 'optional'}
                />
              </>
            )}
            <p className="text-muted-foreground text-xs">{spec.description}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canRun}>
          {running && <Loader2 className="size-4 animate-spin" />}
          {running ? 'Running…' : 'Run'}
        </Button>
        {missingRequired.length > 0 && (
          <span className="text-muted-foreground text-xs">
            Fill in {missingRequired.map((s) => s.name).join(', ')} to run.
          </span>
        )}
      </div>
    </form>
  );
}
