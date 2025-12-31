/**
 * Provider Context for Vega Providers
 * This provides the runtime context that provider modules need to function
 */

const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const config = require('../config');

// Import extractors
const { hubcloudExtractor } = require('./extractors/hubcloudExtractor');
const { gofileExtractor } = require('./extractors/gofileExtractor');
const { superVideoExtractor } = require('./extractors/superVideoExtractor');
const { gdflixExtractor } = require('./extractors/gdflixExtractor');

// Base URL cache for providers
const baseUrlCache = new Map();
let dynamicBaseUrls = null;
let dynamicBaseUrlsFetchedAt = 0;
const DYNAMIC_URL_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Fetch dynamic base URLs from the central config
 */
async function fetchDynamicBaseUrls() {
    // Check if we have recent data
    if (dynamicBaseUrls && Date.now() - dynamicBaseUrlsFetchedAt < DYNAMIC_URL_CACHE_DURATION) {
        return dynamicBaseUrls;
    }

    try {
        console.log('Fetching dynamic base URLs...');
        const response = await axios.get('https://himanshu8443.github.io/providers/modflix.json', {
            timeout: 10000,
        });

        dynamicBaseUrls = response.data;
        dynamicBaseUrlsFetchedAt = Date.now();
        console.log('Dynamic base URLs fetched successfully');
        return dynamicBaseUrls;
    } catch (error) {
        console.error('Failed to fetch dynamic base URLs:', error.message);
        return null;
    }
}

/**
 * Get base URL for a provider
 * Fetches from dynamic config and falls back to hardcoded values
 */
async function getBaseUrl(providerKey) {
    // Normalize key for lookup (providers use different casing)
    const normalizedKey = providerKey.toLowerCase();

    // Check cache first
    if (baseUrlCache.has(normalizedKey)) {
        return baseUrlCache.get(normalizedKey);
    }

    // Try to get from dynamic config first
    const dynamicUrls = await fetchDynamicBaseUrls();
    if (dynamicUrls) {
        // Try exact match first, then case-insensitive
        const exactMatch = dynamicUrls[providerKey];
        if (exactMatch?.url) {
            baseUrlCache.set(normalizedKey, exactMatch.url);
            return exactMatch.url;
        }

        // Try to find by lowercase key
        for (const [key, value] of Object.entries(dynamicUrls)) {
            if (key.toLowerCase() === normalizedKey && value.url) {
                baseUrlCache.set(normalizedKey, value.url);
                return value.url;
            }
        }
    }

    // Fallback to hardcoded URLs
    const fallbackUrls = {
        'rive': 'https://www.rivestream.app',
        'autoembed': 'https://autoembed.cc',
        'showbox': 'https://www.showbox.media',
        'flixhq': 'https://flixhq.to',
        'ridomovies': 'https://ridomovies.tv',
        'primewire': 'https://www.primewire.tf',
        'consumet': 'https://consumet.zendax.tech',
        'vega': 'https://m.vegamovies.cricket',
        'drive': 'https://moviesdrive.forum/',
        'multi': 'https://multimovies.golf',
        '4khdhub': 'https://4khdhub.dad',
        '1cinevood': 'https://1cinevood.codes',
        'cinevood': 'https://1cinevood.codes',
        'world4u': 'https://world4ufree.how',
        'w4u': 'https://world4ufree.how',
        'katmovies': 'https://katmoviehd.pictures',
        'kat': 'https://katmoviehd.pictures',
        'mod': 'https://moviesmod.build',
        'moviesmod': 'https://moviesmod.build',
        'uhd': 'https://uhdmovies.earth',
        'uhdmovies': 'https://uhdmovies.earth',
        'protonmovies': 'https://m.protonmovies.space',
        'filmyfly': 'https://ww2.filmyfiy.mov',
        'movies4u': 'https://movies4u.mp',
        'kmmovies': 'https://kmmovies.store',
        'zeefliz': 'https://zeefliz.bar',
        'ringz': 'https://ringz.today',
        'hdhub4u': 'https://new1.hdhub4u.fo',
        'hdhub': 'https://new1.hdhub4u.fo',
        'ogomovies': 'https://ogomovies.makeup',
        'moviezwap': 'https://www.moviezwap.zip/',
        'luxmovies': 'https://rogmovies.world',
        'lux': 'https://rogmovies.world',
        'topmovies': 'https://moviesleech.top',
        'skymovieshd': 'https://skymovieshd.mba',
        'joya9tv': 'https://joya9tv1.com',
        'guardahd': 'https://guardahd.pl',
        'hianime': 'https://hianime.to',
        'animetsu': 'https://animetsu.cc',
        'tokyoinsider': 'https://www.tokyoinsider.com',
        'kisskh': 'https://kisskh.do',
        'kissh': 'https://kisskh.do',
    };

    const url = fallbackUrls[normalizedKey] || '';
    if (url) {
        baseUrlCache.set(normalizedKey, url);
    }
    return url;
}

/**
 * The provider context object that gets passed to provider modules
 */
const providerContext = {
    axios: axios,
    cheerio: cheerio,
    Crypto: {
        // Mock the expo-crypto module with Node.js crypto
        digestStringAsync: async (algorithm, data) => {
            const hash = crypto.createHash(algorithm.toLowerCase().replace('-', ''));
            hash.update(data);
            return hash.digest('hex');
        },
        CryptoDigestAlgorithm: {
            SHA256: 'SHA-256',
            SHA512: 'SHA-512',
            MD5: 'MD5',
        },
    },
    getBaseUrl: getBaseUrl,
    commonHeaders: config.headers,
    extractors: {
        hubcloudExtracter: hubcloudExtractor,
        gofileExtracter: gofileExtractor,
        superVideoExtractor: superVideoExtractor,
        gdFlixExtracter: gdflixExtractor,
    },
};

// Pre-fetch dynamic URLs on startup
fetchDynamicBaseUrls().catch(() => { });

module.exports = { providerContext, getBaseUrl, fetchDynamicBaseUrls };
