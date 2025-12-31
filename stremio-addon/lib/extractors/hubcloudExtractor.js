/**
 * Hubcloud Extractor
 * Ported from the original Vega app's hubcloudExtractor.ts
 * Extracts stream URLs from Hubcloud/VCloud/Hubdrive/Oxxfile links
 */

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');

// Use node-fetch for Node.js < 18
const fetch = global.fetch || require('node-fetch');

/**
 * Decode base64 encoded values
 */
function decode(value) {
    if (!value) return '';
    try {
        return Buffer.from(value, 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

/**
 * Extract streams from Hubcloud/VCloud/Oxxfile links
 * @param {string} link - The file host URL
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @returns {Promise<Array>} - Array of stream objects
 */
async function hubcloudExtractor(link, signal) {
    try {
        console.log('    hubcloudExtractor:', link);
        const baseUrl = link.split('/').slice(0, 3).join('/');
        const streamLinks = [];

        // Handle oxxfile.info links differently
        if (link.includes('oxxfile') || link.includes('filepress')) {
            return await extractFromOxxfile(link, signal);
        }

        // Step 1: Get the initial page and find the redirect URL
        const vLinkRes = await axios.get(link, {
            headers: config.headers,
            timeout: config.timeout.streamFetch,
            signal: signal,
        });

        const vLinkText = vLinkRes.data;
        const $ = cheerio.load(vLinkText);

        // Find the redirect URL (var url = '...')
        const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];

        let vcloudLink =
            decode(vLinkRedirect[1]?.split('r=')?.[1]) ||
            vLinkRedirect[1] ||
            $('.fa-file-download.fa-lg').parent().attr('href') ||
            link;

        console.log('    vcloudLink:', vcloudLink);

        if (vcloudLink?.startsWith('/')) {
            vcloudLink = `${baseUrl}${vcloudLink}`;
        }

        // Step 2: Follow the redirect and get the VCloud page
        const vcloudRes = await fetch(vcloudLink, {
            headers: config.headers,
            signal: signal,
            redirect: 'follow',
        });

        const $vcloud = cheerio.load(await vcloudRes.text());

        // Step 3: Find all download buttons
        const linkClass = $vcloud('.btn-success.btn-lg.h6,.btn-danger,.btn-secondary,.btn-primary,.btn');

        for (const element of linkClass.toArray()) {
            const itm = $vcloud(element);
            let elementLink = itm.attr('href') || '';

            // Skip empty or javascript links
            if (!elementLink || elementLink.startsWith('javascript:') || elementLink === '#') {
                continue;
            }

            // Handle different link types
            if (elementLink.includes('.dev') && !elementLink.includes('/?id=')) {
                streamLinks.push({ server: 'Cf Worker', link: elementLink, type: 'mkv' });
            } else if (elementLink.includes('pixeld')) {
                // Pixeldrain links
                if (!elementLink.includes('api')) {
                    const token = elementLink.split('/').pop();
                    const pixelBase = elementLink.split('/').slice(0, -2).join('/');
                    elementLink = `${pixelBase}/api/file/${token}?download`;
                }
                streamLinks.push({ server: 'Pixeldrain', link: elementLink, type: 'mkv' });
            } else if (elementLink.includes('hubcloud') || elementLink.includes('/?id=')) {
                // Hubcloud with ID - need to follow redirects
                try {
                    const newLinkRes = await fetch(elementLink, {
                        method: 'HEAD',
                        headers: config.headers,
                        signal: signal,
                        redirect: 'manual',
                    });

                    let newLink = elementLink;
                    if (newLinkRes.status >= 300 && newLinkRes.status < 400) {
                        newLink = newLinkRes.headers.get('location') || elementLink;
                    } else if (newLinkRes.url && newLinkRes.url !== elementLink) {
                        newLink = newLinkRes.url;
                    }

                    if (newLink.includes('googleusercontent')) {
                        newLink = newLink.split('?link=')[1];
                    } else {
                        // Follow another redirect
                        try {
                            const newLinkRes2 = await fetch(newLink, {
                                method: 'HEAD',
                                headers: config.headers,
                                signal: signal,
                                redirect: 'manual',
                            });

                            if (newLinkRes2.status >= 300 && newLinkRes2.status < 400) {
                                const location = newLinkRes2.headers.get('location');
                                newLink = location?.split('?link=')[1] || location || newLink;
                            } else if (newLinkRes2.url && newLinkRes2.url !== newLink) {
                                newLink = newLinkRes2.url.split('?link=')[1] || newLinkRes2.url;
                            }
                        } catch (e) {
                            // Keep the original newLink
                        }
                    }

                    streamLinks.push({ server: 'Hubcloud', link: newLink, type: 'mkv' });
                } catch (error) {
                    console.log('    Hubcloud redirect error:', error.message);
                }
            } else if (elementLink.includes('cloudflarestorage')) {
                streamLinks.push({ server: 'CfStorage', link: elementLink, type: 'mkv' });
            } else if (elementLink.includes('fastdl') || elementLink.includes('fsl.')) {
                streamLinks.push({ server: 'FastDl', link: elementLink, type: 'mkv' });
            } else if (elementLink.includes('hubcdn') && !elementLink.includes('/?id=')) {
                streamLinks.push({ server: 'HubCdn', link: elementLink, type: 'mkv' });
            } else if (elementLink.includes('.mkv') || elementLink.includes('.mp4')) {
                const serverName =
                    elementLink.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)?.[1]?.replace(/\./g, ' ') || 'Download';
                streamLinks.push({ server: serverName, link: elementLink, type: 'mkv' });
            }
        }

        console.log(`    Found ${streamLinks.length} stream links`);
        return streamLinks;
    } catch (error) {
        console.log('    hubcloudExtractor error:', error.message);
        return [];
    }
}

/**
 * Extract streams from Oxxfile/Filepress links
 */
async function extractFromOxxfile(link, signal) {
    const streamLinks = [];
    try {
        console.log('    extractFromOxxfile:', link);

        // Oxxfile typically shows a download page
        const response = await axios.get(link, {
            headers: config.headers,
            timeout: config.timeout.streamFetch,
            signal: signal,
        });

        const $ = cheerio.load(response.data);

        // Look for download buttons
        $('a.btn, a[class*="download"], a[href*=".mkv"], a[href*=".mp4"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('download'))) {
                streamLinks.push({
                    server: 'Oxxfile',
                    link: href.startsWith('http') ? href : `${link.split('/').slice(0, 3).join('/')}${href}`,
                    type: 'mkv',
                });
            }
        });

        // Look for video sources
        $('source, video source').each((_, el) => {
            const src = $(el).attr('src');
            if (src) {
                streamLinks.push({
                    server: 'Oxxfile Stream',
                    link: src.startsWith('http') ? src : `${link.split('/').slice(0, 3).join('/')}${src}`,
                    type: src.includes('.m3u8') ? 'm3u8' : 'mp4',
                });
            }
        });

        // Try to find filepress token and get direct link
        const filepressTokenMatch = response.data.match(/id["']?\s*[:=]\s*["']([^"']+)["']/);
        if (filepressTokenMatch) {
            const tokenId = filepressTokenMatch[1];
            const baseUrl = link.split('/').slice(0, 3).join('/');

            try {
                const tokenRes = await axios.post(`${baseUrl}/api/file/downlaod/`, {
                    id: tokenId,
                    method: 'indexDownlaod',
                    captchaValue: null,
                }, {
                    headers: { 'Content-Type': 'application/json', Referer: baseUrl },
                    signal: signal,
                });

                if (tokenRes.data?.status && tokenRes.data?.data) {
                    const downloadRes = await axios.post(`${baseUrl}/api/file/downlaod2/`, {
                        id: tokenRes.data.data,
                        method: 'indexDownlaod',
                        captchaValue: null,
                    }, {
                        headers: { 'Content-Type': 'application/json', Referer: baseUrl },
                        signal: signal,
                    });

                    if (downloadRes.data?.data?.[0]) {
                        streamLinks.push({
                            server: 'Filepress',
                            link: downloadRes.data.data[0],
                            type: 'mkv',
                        });
                    }
                }
            } catch (e) {
                console.log('    Filepress API error:', e.message);
            }
        }

        console.log(`    Found ${streamLinks.length} oxxfile stream links`);
        return streamLinks;
    } catch (error) {
        console.log('    extractFromOxxfile error:', error.message);
        return [];
    }
}

module.exports = { hubcloudExtractor };
