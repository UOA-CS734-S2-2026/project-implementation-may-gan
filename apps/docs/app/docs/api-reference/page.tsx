import type { Metadata } from 'next';
import { DocsPage } from 'fumadocs-ui/layouts/docs/page';
import { ApiReference } from '@/components/api-reference';

export const metadata: Metadata = {
  title: 'API reference',
  description: 'Interactive reference for the Dayli API.',
};

export default function ApiReferencePage() {
  return (
    <DocsPage full>
      <ApiReference />
    </DocsPage>
  );
}
