/**
 * SuperVideo Extractor
 * Extracts stream URLs from SuperVideo embeds
 */

const axios = require('axios');
const config = require('../../config');

/**
 * Extract stream URL from SuperVideo
 * @param {object} data - The embed data
 * @returns {Promise<string>} - The stream URL
 */
async function superVideoExtractor(data) {
    try {
        if (typeof data === 'string') {
            // If it's a URL, fetch and parse
            const response = await axios.get(data, {
                headers: config.headers,
                timeout: config.timeout.streamFetch,
            });

            // Look for stream URL in response
            const match = response.data.match(/file:\s*["']([^"']+)["']/);
            if (match && match[1]) {
                return match[1];
            }

            // Try another pattern
            const srcMatch = response.data.match(/src:\s*["']([^"']+\.m3u8[^"']*)["']/);
            if (srcMatch && srcMatch[1]) {
                return srcMatch[1];
            }
        } else if (data?.file) {
            return data.file;
        } else if (data?.sources && data.sources[0]) {
            return data.sources[0].file || data.sources[0].src;
        }

        return '';
    } catch (error) {
        console.error('SuperVideo extractor error:', error.message);
        return '';
    }
}

module.exports = { superVideoExtractor };
