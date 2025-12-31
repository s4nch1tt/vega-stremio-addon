/**
 * Gofile Extractor
 * Extracts download links from Gofile
 */

const axios = require('axios');
const config = require('../../config');

/**
 * Extract download link from Gofile
 * @param {string} id - The Gofile content ID
 * @returns {Promise<{link: string, token: string}>}
 */
async function gofileExtractor(id) {
    try {
        // Get guest account token
        const accountResponse = await axios.get('https://api.gofile.io/createAccount', {
            headers: config.headers,
            timeout: config.timeout.streamFetch,
        });

        const token = accountResponse.data?.data?.token;
        if (!token) {
            throw new Error('Failed to get Gofile token');
        }

        // Get content info
        const contentResponse = await axios.get(`https://api.gofile.io/getContent?contentId=${id}&token=${token}&wt=4fd6sg89d7s6`, {
            headers: {
                ...config.headers,
                'Cookie': `accountToken=${token}`,
            },
            timeout: config.timeout.streamFetch,
        });

        const contents = contentResponse.data?.data?.contents;
        if (!contents) {
            throw new Error('No content found');
        }

        // Get first file's download link
        const firstFile = Object.values(contents)[0];
        if (firstFile?.link) {
            return {
                link: firstFile.link,
                token: token,
            };
        }

        throw new Error('No download link found');
    } catch (error) {
        console.error('Gofile extractor error:', error.message);
        return { link: '', token: '' };
    }
}

module.exports = { gofileExtractor };
