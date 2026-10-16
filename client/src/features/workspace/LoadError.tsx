import { RefreshCw } from 'lucide-react';
import { errorOf } from '../../api/errors';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Illustration } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';

/** Failed load inside the workspace: what went wrong and a way to try again. */
export function LoadError({
  title,
  error,
  onRetry,
  retrying = false,
  className,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const err = errorOf(error);
  const offline = err?.code === 'NETWORK_ERROR' || err?.code === 'TIMEOUT';
  return (
    <Card
      role="alert"
      className={cn('flex flex-col items-center px-5 py-8 text-center', className)}
    >
      <Illustration name={offline ? 'unplugged' : 'brokenGear'} size={104} />
      <h3 className="mt-3 text-lg font-extrabold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {err?.message ?? 'Something went wrong. Please try again.'}
      </p>
      <Button variant="outline" className="mt-4" loading={retrying} onClick={onRetry}>
        {!retrying && <RefreshCw aria-hidden />} Retry
      </Button>
    </Card>
  );
}
