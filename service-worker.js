// Service Worker Name and Cache versioning
const CACHE_NAME = 'asotabsicon-v1';

// List of files to cache on install. This ensures these pages are available offline immediately.
const urlsToCache = [
    '/',
    'index.html',
    'styles.css',
    'script.js',
    'properties.html', // Caching the main listing page
    'property-detail.html', // Caching the detail page structure
    'contact.html', // Assuming you have a contact page
    // You should add all core pages referenced in your navigation here:
    'land.html',
    'commercial.html',
    'about.html',
    'valuation.html',
    'login.html',
    // We can't cache external assets (like font-awesome or placehold.co images)
    // but the site will still be readable without them.
];

// --- INSTALL EVENT ---
// This is called when the browser registers the Service Worker for the first time.
self.addEventListener('install', event => {
    // Perform install steps
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache. Caching core assets.');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting()) // Force the new worker to activate immediately
            .catch(error => {
                console.error('Failed to cache assets during install:', error);
            })
    );
});

// --- ACTIVATE EVENT ---
// This is called when the Service Worker is activated. We use it to clean up old caches.
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        // Delete old/expired caches
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Takes control of pages immediately
    );
});

// --- FETCH EVENT ---
// This is called every time the browser tries to fetch a resource.
self.addEventListener('fetch', event => {
    // Strategy: Cache-First, then Network. This is ideal for static PWA content.
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    console.log('[Service Worker] Serving from cache:', event.request.url);
                    return response;
                }
                
                // No cache match, fetch from network
                return fetch(event.request).then(
                    networkResponse => {
                        // Check if we received a valid response
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // IMPORTANT: Do not cache cross-origin requests unless necessary,
                        // especially external APIs or CDNs. We'll only cache successful
                        // responses for our own content.
                        if (urlsToCache.includes(event.request.url.replace(self.location.origin, '')) || event.request.url.includes(self.location.origin)) {
                            // Clone the response because the stream can only be read once
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                // Cache the new response for future use
                                cache.put(event.request, responseToCache);
                            });
                        }

                        return networkResponse;
                    }
                ).catch(error => {
                    // This handles network failures (offline mode)
                    console.log('[Service Worker] Fetch failed, serving offline fallback if available.', error);
                    
                    // You could serve an offline page here, but since all core pages
                    // are already in the cache, they should load fine.
                    // If a user tries to load an uncached external resource (like an image), 
                    // this will fail gracefully.
                });
            })
    );
});