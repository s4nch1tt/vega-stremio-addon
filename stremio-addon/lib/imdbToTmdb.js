/**
 * IMDB to TMDB ID Converter
 * Uses free API to convert IMDB IDs to TMDB IDs
 */

const axios = require('axios');
const config = require('../config');

// Cache for ID conversions
const idCache = new Map();

/**
 * Convert IMDB ID to TMDB ID
 * @param {string} imdbId - IMDB ID (e.g., 'tt1234567')
 * @param {string} type - 'movie' or 'series'
 * @returns {Promise<string|null>} - TMDB ID or null if not found
 */
async function imdbToTmdb(imdbId, type = 'movie') {
    if (!imdbId || !imdbId.startsWith('tt')) {
        return null;
    }

    // Check cache
    const cacheKey = `${imdbId}:${type}`;
    if (idCache.has(cacheKey)) {
        return idCache.get(cacheKey);
    }

    try {
        // Try to get TMDB ID from Cinemeta (Stremio's catalog addon)
        const mediaType = type === 'series' ? 'series' : 'movie';
        const url = `https://v3-cinemeta.strem.io/meta/${mediaType}/${imdbId}.json`;

        const response = await axios.get(url, {
            headers: config.headers,
            timeout: config.timeout.imdbToTmdb,
        });

        // Cinemeta returns movie info, but we need to extract TMDB ID from it
        // Some entries have TMDB info in the links array
        const meta = response.data?.meta;
        let tmdbId = null;

        if (meta) {
            // Check if there's a TMDB link
            const tmdbLink = meta.links?.find(l => l.category === 'tmdb' || l.name?.toLowerCase().includes('tmdb'));
            if (tmdbLink) {
                const match = tmdbLink.url?.match(/\/(\d+)/);
                if (match) {
                    tmdbId = match[1];
                }
            }

            // If no TMDB link, try to get from trailers or other sources
            if (!tmdbId && meta.trailers?.length > 0) {
                // Some trailers have TMDB references
                for (const trailer of meta.trailers) {
                    if (trailer.source?.includes('tmdb')) {
                        const match = trailer.source.match(/(\d+)/);
                        if (match) {
                            tmdbId = match[1];
                            break;
                        }
                    }
                }
            }
        }

        if (tmdbId) {
            idCache.set(cacheKey, tmdbId);
        }

        return tmdbId;
    } catch (error) {
        console.log(`Could not get TMDB ID for ${imdbId}, will use IMDB ID only`);
        return null;
    }
}

/**
 * Parse Stremio stream request ID
 * @param {string} id - Stremio ID (e.g., 'tt1234567' or 'tt1234567:1:1')
 * @returns {object} - Parsed ID info
 */
function parseStremioId(id) {
    const parts = id.split(':');

    return {
        imdbId: parts[0],
        season: parts[1] ? parseInt(parts[1], 10) : null,
        episode: parts[2] ? parseInt(parts[2], 10) : null,
    };
}

module.exports = { imdbToTmdb, parseStremioId };
