type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}
