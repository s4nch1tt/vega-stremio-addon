/**
 * Vega Stremio Addon
 * * Updated with enhanced metadata (Quality, Size, Audio) formatting.
 */

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const config = require('./config');
const { getStreamsFromAllProviders } = require('./lib/providerLoader');
const { imdbToTmdb, parseStremioId } = require('./lib/imdbToTmdb');
const { getSubtitles } = require('./lib/subtitleProvider');

// Addon manifest with configuration support
const manifest = {
    id: 'org.vega.stremio.addon',
    version: '1.3.0', // Version updated
    name: 'Vega Providers',
    description: 'Stream movies and series with enhanced metadata (Quality, Size, Language).',
    types: ['movie', 'series'],
    resources: ['stream', 'subtitles'],
    idPrefixes: ['tt'],
    catalogs: [],
    background: 'https://raw.githubusercontent.com/vega-org/vega-app/main/assets/icon.png',
    logo: 'https://raw.githubusercontent.com/vega-org/vega-app/main/assets/icon.png',
    behaviorHints: {
        configurable: true,
        configurationRequired: false,
    },
    config: [
        { key: 'info', type: 'text', title: '--- GLOBAL PROVIDERS ---' },
        { key: 'autoEmbed', type: 'checkbox', default: 'true', title: 'MultiStream' },
        { key: 'vega', type: 'checkbox', default: 'true', title: 'VegaMovies' },
        { key: 'drive', type: 'checkbox', default: 'true', title: 'MoviesDrive' },
        { key: 'multi', type: 'checkbox', default: 'true', title: 'MultiMovies' },
        { key: '4khdhub', type: 'checkbox', default: 'true', title: '4khdHub' },
        { key: '1cinevood', type: 'checkbox', default: 'true', title: 'Cinewood' },
        { key: 'world4u', type: 'checkbox', default: 'true', title: 'World4uFree' },
        { key: 'katmovies', type: 'checkbox', default: 'true', title: 'KatMoviesHd' },
        { key: 'mod', type: 'checkbox', default: 'true', title: 'MoviesMod' },
        { key: 'uhd', type: 'checkbox', default: 'true', title: 'UHDMovies' },
        { key: 'protonMovies', type: 'checkbox', default: 'true', title: 'ProtonMovies' },
        { key: 'filmyfly', type: 'checkbox', default: 'true', title: 'FilmyFly' },
        { key: 'movies4u', type: 'checkbox', default: 'true', title: 'Movies4U' },
        { key: 'kmMovies', type: 'checkbox', default: 'true', title: 'KmMovies' },
        { key: 'zeefliz', type: 'checkbox', default: 'true', title: 'Zeefliz' },
        { key: 'ringz', type: 'checkbox', default: 'true', title: 'Ringz' },
        { key: 'hdhub4u', type: 'checkbox', default: 'true', title: 'HdHub4u' },
        { key: 'info2', type: 'text', title: '--- ENGLISH PROVIDERS ---' },
        { key: 'showbox', type: 'checkbox', default: 'true', title: 'ShowBox' },
        { key: 'ridoMovies', type: 'checkbox', default: 'true', title: 'RidoMovies' },
        { key: 'flixhq', type: 'checkbox', default: 'true', title: 'FlixHQ' },
        { key: 'primewire', type: 'checkbox', default: 'true', title: 'Primewire' },
        { key: 'hiAnime', type: 'checkbox', default: 'true', title: 'HiAnime (Anime)' },
        { key: 'animetsu', type: 'checkbox', default: 'true', title: 'Animetsu (Anime)' },
        { key: 'tokyoInsider', type: 'checkbox', default: 'true', title: 'TokyoInsider (Anime)' },
        { key: 'kissKh', type: 'checkbox', default: 'true', title: 'KissKh (K-Drama)' },
        { key: 'info3', type: 'text', title: '--- INDIA/REGIONAL PROVIDERS ---' },
        { key: 'ogomovies', type: 'checkbox', default: 'true', title: 'Ogomovies (India)' },
        { key: 'moviezwap', type: 'checkbox', default: 'true', title: 'MoviezWap (India)' },
        { key: 'luxMovies', type: 'checkbox', default: 'true', title: 'RogMovies (India)' },
        { key: 'topmovies', type: 'checkbox', default: 'true', title: 'TopMovies (India)' },
        { key: 'Joya9tv', type: 'checkbox', default: 'true', title: 'Joya9tv (India)' },
        { key: 'guardahd', type: 'checkbox', default: 'true', title: 'GuardaHD (Italy)' },
    ],
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
    const userConfig = args.config || {};
    let enabledProvidersList;

    if (Object.keys(userConfig).length === 0) {
        enabledProvidersList = config.enabledProviders;
    } else {
        enabledProvidersList = config.enabledProviders.filter(p => {
            const configValue = userConfig[p.value];
            return configValue === 'true' || configValue === 'on' || configValue === true || configValue === undefined;
        });
    }

    try {
        const { imdbId, season, episode } = parseStremioId(args.id);
        const type = args.type === 'series' ? 'series' : 'movie';
        const tmdbId = await imdbToTmdb(imdbId, type);

        if (!tmdbId && !imdbId) return { streams: [] };

        const params = { imdbId, tmdbId: tmdbId || '', type, season: season || '', episode: episode || '' };
        const vegaStreams = await getStreamsFromAllProviders(params, enabledProvidersList);

        const stremioStreams = vegaStreams.map((stream) => {
            // --- 1. ENHANCED METADATA LOGIC ---
            const quality = stream.quality ? `${stream.quality}p` : 'HD';
            const size = stream.size ? ` | 💾 ${stream.size}` : '';
            const audio = stream.language ? ` | 🗣️ ${stream.language}` : '';
            const provider = stream.providerName || 'Vega';
            
            // Emoji indicators
            const qualityEmoji = stream.quality >= 2160 ? '🔥' : '⭐';
            const subEmoji = (stream.subtitles && stream.subtitles.length > 0) ? ' 🔤' : '';

            // Formatting Title (Description text)
            // Example: ⭐ VegaMovies | 1080p | 🗣️ Hindi-Eng | 💾 1.4GB 🔤
            let description = `${qualityEmoji} ${provider} | ${quality}${audio}${size}${subEmoji}`;
            
            if (stream.server) {
                description += `\n🖥️ Server: ${stream.server}`;
            }

            const stremioStream = {
                // Name appears in the left column
                name: `${provider}\n${quality}`, 
                // Title appears as the link description
                title: description,
            };

            if (stream.link) {
                stremioStream.url = stream.link;
            }

            if (stream.headers) {
                stremioStream.behaviorHints = {
                    notWebReady: true,
                    proxyHeaders: { request: stream.headers },
                };
            }

            if (stream.subtitles && Array.isArray(stream.subtitles)) {
                stremioStream.subtitles = stream.subtitles.map((sub, index) => ({
                    id: `${stream.providerValue || 'vega'}-sub-${index}`,
                    url: sub.uri || sub.url || sub.link,
                    lang: sub.language || sub.lang || 'eng',
                })).filter(sub => sub.url);
            }

            return stremioStream;
        });

        return { streams: stremioStreams.filter(s => s.url) };

    } catch (error) {
        console.error('Stream handler error:', error);
        return { streams: [] };
    }
});

builder.defineSubtitlesHandler(async (args) => {
    try {
        const { imdbId, season, episode } = parseStremioId(args.id);
        const subtitles = await getSubtitles(imdbId, args.type, season, episode);
        return { subtitles };
    } catch (error) {
        return { subtitles: [] };
    }
});

const port = config.port;
serveHTTP(builder.getInterface(), { port });
