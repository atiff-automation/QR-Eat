import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'QR-Eat - Restaurant Management',
        short_name: 'QR-Eat',
        description: 'Restaurant management system for staff and owners',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',
        orientation: 'any',
        icons: [
            {
                src: '/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable',
            },
            {
                src: '/icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
            },
        ],
        categories: ['business', 'productivity', 'food'],
        shortcuts: [
            {
                name: 'Orders',
                url: '/dashboard/orders',
                description: 'View and manage orders',
                icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
            },
            {
                name: 'Kitchen Display',
                url: '/kitchen',
                description: 'Kitchen order queue',
                icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
            },
            {
                name: 'Menu Management',
                url: '/dashboard/menu',
                description: 'Edit menu items',
                icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
            },
        ],
    };
}
