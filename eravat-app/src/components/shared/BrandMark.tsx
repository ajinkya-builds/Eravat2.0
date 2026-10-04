import { cn } from '../../lib/utils';

/** Design-pack brand mark (docs/design field-top / CC chrome). */
export function BrandMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = size === 'sm' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-base';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-[0.65rem] font-extrabold text-white shrink-0',
        'bg-gradient-to-br from-primary to-emerald-800 shadow-sm shadow-primary/25',
        dim,
        className,
      )}
    >
      E
    </span>
  );
}
