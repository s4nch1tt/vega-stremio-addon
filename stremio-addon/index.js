/**
 * Vega Stremio Addon
 * 
 * This addon provides streaming links from Vega providers
 * for movies and series in Stremio.
 * 
 * Supports configuration to enable/disable individual providers.
 */

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const config = require('./config');
const { getStreamsFromAllProviders } = require('./lib/providerLoader');
const { imdbToTmdb, parseStremioId } = require('./lib/imdbToTmdb');
const { getSubtitles } = require('./lib/subtitleProvider');

// Build configuration options for each provider
const providerConfigOptions = config.enabledProviders.map(provider => ({
    key: provider.value,
    type: 'checkbox',
    default: 'true',
    title: provider.displayName,
    // Group providers by category
    ...(provider.priority <= 17 ? {} :
        provider.priority <= 25 ? {} :
            provider.priority <= 30 ? {} : {})
}));

// Addon manifest with configuration support
const manifest = {
    id: 'org.vega.stremio.addon',
    version: '1.2.0',
    name: 'Vega Providers',
    description: 'Stream movies and series from 31 Vega providers with built-in subtitles. Configure which providers to use in addon settings.',

    // Supported content types
    types: ['movie', 'series'],

    // We provide streams AND subtitles
    resources: ['stream', 'subtitles'],

    // We work with IMDB IDs
    idPrefixes: ['tt'],

    // Catalog definitions (empty since we only provide streams)
    catalogs: [],

    // Background and logo for the addon page
    background: 'https://raw.githubusercontent.com/vega-org/vega-app/main/assets/icon.png',
    logo: 'https://raw.githubusercontent.com/vega-org/vega-app/main/assets/icon.png',

    // Contact info
    contactEmail: '',

    // Behavior hints - THIS ENABLES CONFIGURATION
    behaviorHints: {
        configurable: true,
        configurationRequired: false,
    },

    // Configuration options for each provider
    config: [
        {
            key: 'info',
            type: 'text',
            title: '--- GLOBAL PROVIDERS ---',
        },
        // Global providers
        { key: 'autoEmbed', type: 'checkbox', default: 'true', title: 'MultiStream (Best for most movies)' },
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

        {
            key: 'info2',
            type: 'text',
            title: '--- ENGLISH PROVIDERS ---',
        },
        // English providers
        { key: 'showbox', type: 'checkbox', default: 'true', title: 'ShowBox' },
        { key: 'ridoMovies', type: 'checkbox', default: 'true', title: 'RidoMovies' },
        { key: 'flixhq', type: 'checkbox', default: 'true', title: 'FlixHQ' },
        { key: 'primewire', type: 'checkbox', default: 'true', title: 'Primewire' },
        { key: 'hiAnime', type: 'checkbox', default: 'true', title: 'HiAnime (Anime)' },
        { key: 'animetsu', type: 'checkbox', default: 'true', title: 'Animetsu (Anime)' },
        { key: 'tokyoInsider', type: 'checkbox', default: 'true', title: 'TokyoInsider (Anime)' },
        { key: 'kissKh', type: 'checkbox', default: 'true', title: 'KissKh (K-Drama)' },

        {
            key: 'info3',
            type: 'text',
            title: '--- INDIA/REGIONAL PROVIDERS ---',
        },
        // India/Regional providers
        { key: 'ogomovies', type: 'checkbox', default: 'true', title: 'Ogomovies (India)' },
        { key: 'moviezwap', type: 'checkbox', default: 'true', title: 'MoviezWap (India)' },
        { key: 'luxMovies', type: 'checkbox', default: 'true', title: 'RogMovies (India)' },
        { key: 'topmovies', type: 'checkbox', default: 'true', title: 'TopMovies (India)' },
        { key: 'Joya9tv', type: 'checkbox', default: 'true', title: 'Joya9tv (India)' },
        { key: 'guardahd', type: 'checkbox', default: 'true', title: 'GuardaHD (Italy)' },
    ],
};

// Create the addon builder
const builder = new addonBuilder(manifest);

/**
 * Stream Handler
 * This is called when a user clicks on a movie/series in Stremio
 */
builder.defineStreamHandler(async (args) => {
    console.log('='.repeat(60));
    console.log(`Stream request: ${args.type} - ${args.id}`);
    console.log('='.repeat(60));

    // Get user configuration (which providers are enabled)
    const userConfig = args.config || {};
    console.log('User config received:', JSON.stringify(userConfig));

    // Determine which providers are enabled
    // If no config is provided, use all providers (default behavior)
    let enabledProvidersList;

    if (Object.keys(userConfig).length === 0) {
        // No config provided - use all providers
        console.log('No user config - using all providers');
        enabledProvidersList = config.enabledProviders;
    } else {
        // Filter based on user config
        // Stremio checkboxes: checked = 'true' or 'on', unchecked = not present or 'false'
        enabledProvidersList = config.enabledProviders.filter(p => {
            const configValue = userConfig[p.value];
            // Include if: value is 'true', 'on', true, or not explicitly set to 'false'
            const isEnabled = configValue === 'true' || configValue === 'on' ||
                configValue === true || configValue === undefined ||
                (configValue !== 'false' && configValue !== false);
            return isEnabled;
        });
    }

    console.log(`Enabled providers (${enabledProvidersList.length}): ${enabledProvidersList.map(p => p.displayName).join(', ')}`);


    try {
        // Parse the Stremio ID
        const { imdbId, season, episode } = parseStremioId(args.id);
        console.log(`Parsed ID: IMDB=${imdbId}, Season=${season}, Episode=${episode}`);

        // Determine content type
        const type = args.type === 'series' ? 'series' : 'movie';

        // Convert IMDB to TMDB ID
        console.log('Converting IMDB to TMDB...');
        const tmdbId = await imdbToTmdb(imdbId, type);
        console.log(`TMDB ID: ${tmdbId}`);

        if (!tmdbId && !imdbId) {
            console.log('No valid ID found');
            return { streams: [] };
        }

        // Prepare parameters for providers
        const params = {
            imdbId: imdbId,
            tmdbId: tmdbId || '',
            type: type,
            season: season || '',
            episode: episode || '',
        };

        console.log('Fetching streams from providers...');

        // Get streams from enabled providers only
        const vegaStreams = await getStreamsFromAllProviders(params, enabledProvidersList);
        console.log(`Found ${vegaStreams.length} streams from providers`);

        // Convert Vega streams to Stremio format
        const stremioStreams = vegaStreams.map((stream) => {
            // Determine stream title
            let title = stream.providerName || 'Unknown';
            if (stream.server) {
                title += ` - ${stream.server}`;
            }
            if (stream.quality) {
                title += ` [${stream.quality}p]`;
            }

            // Add subtitle indicator if available
            if (stream.subtitles && stream.subtitles.length > 0) {
                title += ` 🔤`;
            }

            // Create Stremio stream object
            const stremioStream = {
                name: stream.providerName || 'Vega',
                title: title,
            };

            // Add the stream URL
            if (stream.link) {
                if (stream.type === 'm3u8' || stream.link.includes('.m3u8')) {
                    // HLS stream
                    stremioStream.url = stream.link;
                } else {
                    // Direct URL
                    stremioStream.url = stream.link;
                }
            }

            // Add headers if present
            if (stream.headers) {
                stremioStream.behaviorHints = {
                    notWebReady: true,
                    proxyHeaders: {
                        request: stream.headers,
                    },
                };
            }

            // Add embedded subtitles from provider if available
            if (stream.subtitles && Array.isArray(stream.subtitles) && stream.subtitles.length > 0) {
                stremioStream.subtitles = stream.subtitles.map((sub, index) => ({
                    id: `${stream.providerValue || 'vega'}-sub-${index}`,
                    url: sub.uri || sub.url || sub.link,
                    lang: sub.language || sub.lang || 'eng',
                })).filter(sub => sub.url);
            }

            return stremioStream;
        });

        // Filter out streams without URLs
        const validStreams = stremioStreams.filter(s => s.url);
        console.log(`Returning ${validStreams.length} valid streams to Stremio`);

        return { streams: validStreams };

    } catch (error) {
        console.error('Stream handler error:', error);
        return { streams: [] };
    }
});

/**
 * Subtitle Handler
 * This is called when Stremio needs subtitles for a movie/series
 */
builder.defineSubtitlesHandler(async (args) => {
    console.log('='.repeat(60));
    console.log(`Subtitle request: ${args.type} - ${args.id}`);
    console.log('='.repeat(60));

    try {
        // Parse the Stremio ID
        const { imdbId, season, episode } = parseStremioId(args.id);
        console.log(`Fetching subtitles for IMDB=${imdbId}, Season=${season}, Episode=${episode}`);

        // Fetch subtitles
        const subtitles = await getSubtitles(imdbId, args.type, season, episode);
        console.log(`Found ${subtitles.length} subtitles`);

        return { subtitles };
    } catch (error) {
        console.error('Subtitle handler error:', error);
        return { subtitles: [] };
    }
});

// Start the addon server
const port = config.port;
serveHTTP(builder.getInterface(), { port });

console.log('');
console.log('='.repeat(60));
console.log('🎬 Vega Stremio Addon Started!');
console.log('='.repeat(60));
console.log('');
console.log(`Addon URL: http://127.0.0.1:${port}/manifest.json`);
console.log('');
console.log('Features:');
console.log(`  ✅ ${config.enabledProviders.length} streaming providers`);
console.log('  ✅ Built-in subtitle support');
console.log('  ✅ Configurable provider selection');
console.log('');
console.log('To install in Stremio:');
console.log('1. Open Stremio');
console.log('2. Go to Addons (puzzle icon)');
console.log('3. Click "Install addon" at the top');
console.log(`4. Paste this URL: http://127.0.0.1:${port}/manifest.json`);
console.log('');
console.log('💡 TIP: Reinstall the addon to update to the new version!');
console.log('');
console.log('='.repeat(60));
