import { Metadata } from 'next';
import { OfflineView } from '@/components/OfflineView';

export const metadata: Metadata = {
    title: 'Offline - Connection Lost',
    description: 'You are currently offline',
};

export default function OfflinePage() {
    return <OfflineView />;
}
