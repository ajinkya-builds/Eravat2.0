import { cn } from '../../lib/utils';
import { ELEPHANT_LOGO_URL } from '../../lib/publicAsset';

/**
 * Existing elephant mark, sized for the field and Command Center chrome.
 * The artwork has transparent padding, so the image is drawn larger than the box.
 */
export function BrandMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-12 h-12';
  return (
    <span className={cn('relative inline-flex items-center justify-center overflow-visible shrink-0', dim, className)}>
      <img
        src={ELEPHANT_LOGO_URL}
        alt="ERAVAT Logo"
        className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md"
      />
    </span>
  );
}
