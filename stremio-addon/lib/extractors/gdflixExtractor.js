/**
 * GDflix Extractor
 * Extracts stream URLs from GDflix/GDrive links
 */

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');

/**
 * Extract streams from GDflix links
 * @param {string} link - The GDflix URL
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @returns {Promise<Array>} - Array of stream objects
 */
async function gdflixExtractor(link, signal) {
    const streams = [];

    try {
        const response = await axios.get(link, {
            headers: config.headers,
            timeout: config.timeout.streamFetch,
            signal: signal,
        });

        const $ = cheerio.load(response.data);

        // Look for stream links
        $('a[href*="drive.google.com"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
                // Convert Google Drive link to direct stream
                const fileId = href.match(/\/d\/([^/]+)/)?.[1] || href.match(/id=([^&]+)/)?.[1];
                if (fileId) {
                    streams.push({
                        server: 'GDrive',
                        link: `https://drive.google.com/uc?export=download&id=${fileId}`,
                        type: 'mp4',
                    });
                }
            }
        });

        // Look for direct video links
        $('video source, source').each((_, el) => {
            const src = $(el).attr('src');
            if (src) {
                streams.push({
                    server: 'GDflix',
                    link: src,
                    type: src.includes('.m3u8') ? 'm3u8' : 'mp4',
                });
            }
        });

        // Look for download buttons
        $('a.btn, a[class*="download"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('.mp4') || href.includes('.mkv') || href.includes('download'))) {
                streams.push({
                    server: 'GDflix Download',
                    link: href,
                    type: 'mp4',
                });
            }
        });

    } catch (error) {
        console.error('GDflix extractor error:', error.message);
    }

    return streams;
}

module.exports = { gdflixExtractor };
