'use client';

import { useState, useEffect } from 'react';
import { Smartphone, X } from 'lucide-react';

export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);

            // Only show prompt if user hasn't dismissed it before
            const dismissed = localStorage.getItem('pwa-install-dismissed');
            if (!dismissed) {
                // Delay showing prompt by 30 seconds to avoid interrupting workflow
                setTimeout(() => setShowPrompt(true), 30000);
            }
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('PWA installed by staff user');
        }

        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', 'true');
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm bg-white rounded-lg shadow-lg p-4 z-50 border border-gray-200">
            <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-3">
                <div className="bg-blue-100 rounded-lg p-2">
                    <Smartphone className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Install QR-Eat</h3>
                    <p className="text-sm text-gray-600 mb-3">
                        Install for faster access and work offline when needed
                    </p>
                    <button
                        onClick={handleInstall}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-md transition w-full"
                    >
                        Install App
                    </button>
                </div>
            </div>
        </div>
    );
}
