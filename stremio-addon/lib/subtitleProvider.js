/**
 * Subtitle Provider for Vega Stremio Addon
 * Fetches subtitles from OpenSubtitles via Stremio's proxy
 */

const axios = require('axios');
const config = require('../config');

// Cache for subtitles
const subtitleCache = new Map();

/**
 * Fetch subtitles for a movie/series
 * @param {string} imdbId - IMDB ID
 * @param {string} type - 'movie' or 'series'
 * @param {number} season - Season number (for series)
 * @param {number} episode - Episode number (for series)
 * @returns {Promise<Array>} - Array of subtitle objects
 */
async function getSubtitles(imdbId, type = 'movie', season = null, episode = null) {
    const cacheKey = `${imdbId}:${type}:${season}:${episode}`;

    if (subtitleCache.has(cacheKey)) {
        return subtitleCache.get(cacheKey);
    }

    const subtitles = [];

    // Try OpenSubtitles via Stremio's addon
    try {
        const openSubs = await fetchFromOpenSubtitles(imdbId, type, season, episode);
        subtitles.push(...openSubs);
    } catch (error) {
        console.log('OpenSubtitles fetch failed:', error.message);
    }

    // Try SubDivX for Spanish subtitles
    try {
        const subdivxSubs = await fetchFromSubDivX(imdbId);
        subtitles.push(...subdivxSubs);
    } catch (error) {
        // Silent fail
    }

    // Cache the results
    if (subtitles.length > 0) {
        subtitleCache.set(cacheKey, subtitles);
    }

    return subtitles;
}

/**
 * Fetch subtitles from OpenSubtitles via their Stremio addon
 */
async function fetchFromOpenSubtitles(imdbId, type, season, episode) {
    const subtitles = [];

    try {
        // Build the correct URL format
        let id = imdbId;
        if (type === 'series' && season && episode) {
            id = `${imdbId}:${season}:${episode}`;
        }

        // Try the OpenSubtitles v3 addon endpoint
        const url = `https://opensubtitles-v3.strem.io/subtitles/${type}/${id}.json`;

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (response.data?.subtitles && Array.isArray(response.data.subtitles)) {
            for (const sub of response.data.subtitles.slice(0, 20)) {
                if (sub.url) {
                    subtitles.push({
                        id: sub.id || `os-${Math.random().toString(36).substr(2, 9)}`,
                        url: sub.url,
                        lang: sub.lang || 'eng',
                    });
                }
            }
        }
    } catch (error) {
        console.log('OpenSubtitles v3 failed:', error.message);

        // Fallback to OpenSubtitles v2
        try {
            let id = imdbId;
            if (type === 'series' && season && episode) {
                id = `${imdbId}:${season}:${episode}`;
            }

            const url = `https://opensubtitles.strem.io/stremio/v1/subtitles/${type}/${id}.json`;

            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            if (response.data?.subtitles && Array.isArray(response.data.subtitles)) {
                for (const sub of response.data.subtitles.slice(0, 20)) {
                    if (sub.url) {
                        subtitles.push({
                            id: sub.id || `os2-${Math.random().toString(36).substr(2, 9)}`,
                            url: sub.url,
                            lang: sub.lang || 'eng',
                        });
                    }
                }
            }
        } catch (e) {
            // Silent fail
        }
    }

    return subtitles;
}

/**
 * Fetch Spanish subtitles from SubDivX
 */
async function fetchFromSubDivX(imdbId) {
    // SubDivX is mainly for Spanish content
    return [];
}

/**
 * Get language name from code
 */
function getLanguageName(code) {
    const languages = {
        'eng': 'English',
        'hin': 'Hindi',
        'spa': 'Spanish',
        'fre': 'French',
        'ger': 'German',
        'ita': 'Italian',
        'por': 'Portuguese',
        'rus': 'Russian',
        'ara': 'Arabic',
        'jpn': 'Japanese',
        'kor': 'Korean',
        'chi': 'Chinese',
    };
    return languages[code] || code;
}

module.exports = {
    getSubtitles,
    fetchFromOpenSubtitles,
};
