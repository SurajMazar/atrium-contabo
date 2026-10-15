import { PageSkeleton } from '@/components/common/page-skeleton';

/** Instant navigation: shown while the next screen's route payload arrives. */
export default function Loading() {
  return <PageSkeleton />;
}
