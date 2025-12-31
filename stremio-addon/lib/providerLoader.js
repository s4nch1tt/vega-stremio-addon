/**
 * Provider Loader
 * Downloads and executes Vega provider modules
 * Supports both ID-based and title-based providers
 */

const axios = require('axios');
const config = require('../config');
const { providerContext } = require('./providerContext');

// Use node-fetch for Node.js < 18, otherwise use global fetch
const fetch = global.fetch || require('node-fetch');

// Module cache
const moduleCache = new Map();

// Title cache (to avoid fetching title multiple times)
const titleCache = new Map();

/**
 * Execute a provider module using vm for proper CommonJS execution
 */
function executeModule(moduleCode, ...args) {
    const vm = require('vm');

    // Create a module-like context
    const exports = {};
    const module = { exports };

    // Create sandbox with all needed globals
    const sandbox = {
        exports,
        module,
        require: () => ({}),
        console,
        Promise,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Math,
        Date,
        RegExp,
        JSON,
        Error,
        TypeError,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        fetch: fetch,
        btoa: (str) => Buffer.from(str).toString('base64'),
        atob: (str) => Buffer.from(str, 'base64').toString(),
        process: { env: {} },
        Buffer,
        encodeURI,
        encodeURIComponent,
        decodeURI,
        decodeURIComponent,
        isNaN,
        isFinite,
        parseInt,
        parseFloat,
    };

    try {
        // Create a new context
        vm.createContext(sandbox);

        // Execute the module code in the context
        vm.runInContext(moduleCode, sandbox, {
            timeout: 10000,
        });

        // Return the exports (module may have set exports directly or module.exports)
        return sandbox.module.exports || sandbox.exports;
    } catch (error) {
        console.error('Error executing module:', error);
        throw error;
    }
}

/**
 * Download a provider module from GitHub
 */
async function downloadModule(providerValue, moduleName) {
    const cacheKey = `${providerValue}:${moduleName}`;
    const cached = moduleCache.get(cacheKey);

    // Check if cache is valid
    if (cached && Date.now() - cached.cachedAt < config.cache.moduleCacheExpiry) {
        return cached.code;
    }

    const url = `${config.vegaProvidersBaseUrl}/dist/${providerValue}/${moduleName}.js`;

    try {
        const response = await axios.get(url, {
            timeout: config.timeout.providerDownload,
            headers: config.headers,
        });

        const code = response.data;
        moduleCache.set(cacheKey, { code, cachedAt: Date.now() });
        return code;
    } catch (error) {
        // Silent fail for optional modules
        return null;
    }
}

/**
 * Get movie/series title from Cinemeta using IMDB ID
 */
async function getTitleFromCinemeta(imdbId, type) {
    const cacheKey = `title:${imdbId}`;
    if (titleCache.has(cacheKey)) {
        return titleCache.get(cacheKey);
    }

    try {
        const mediaType = type === 'series' ? 'series' : 'movie';
        const url = `https://v3-cinemeta.strem.io/meta/${mediaType}/${imdbId}.json`;

        const response = await axios.get(url, {
            timeout: 10000,
            headers: config.headers,
        });

        const meta = response.data?.meta;
        if (meta) {
            const result = {
                title: meta.name,
                year: meta.year || meta.releaseInfo?.split('–')[0],
                type: mediaType,
            };
            titleCache.set(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error(`Failed to get title for ${imdbId}:`, error.message);
    }
    return null;
}

/**
 * ID-based providers that work directly with IMDB/TMDB IDs
 */
const idBasedProviders = ['autoEmbed'];

/**
 * Get streams from a provider using ID (for ID-based providers like autoEmbed)
 */
async function getStreamsFromProviderById(providerValue, params) {
    try {
        const streamModuleCode = await downloadModule(providerValue, 'stream');
        if (!streamModuleCode) return [];

        const moduleExports = executeModule(streamModuleCode);
        if (!moduleExports.getStream) return [];

        const linkPayload = JSON.stringify({
            tmdbId: params.tmdbId,
            imdbId: params.imdbId,
            season: params.season,
            episode: params.episode,
            type: params.type,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout.streamFetch);

        try {
            const streams = await moduleExports.getStream({
                link: linkPayload,
                type: params.type,
                signal: controller.signal,
                providerContext: providerContext,
            });
            clearTimeout(timeoutId);
            return streams || [];
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    } catch (error) {
        console.error(`Error getting streams from ${providerValue} (ID):`, error.message);
        return [];
    }
}

/**
 * Get streams from a provider using title search (for search-based providers)
 */
async function getStreamsFromProviderBySearch(providerValue, params, movieInfo) {
    try {
        // Step 1: Download posts module (for search)
        const postsModuleCode = await downloadModule(providerValue, 'posts');
        if (!postsModuleCode) {
            console.log(`  No posts module for ${providerValue}`);
            return [];
        }

        const postsModule = executeModule(postsModuleCode);
        if (!postsModule.getSearchPosts) {
            console.log(`  No getSearchPosts for ${providerValue}`);
            return [];
        }

        // Step 2: Search for the movie by title
        const controller = new AbortController();
        const searchTimeout = setTimeout(() => controller.abort(), 15000);

        let searchResults;
        try {
            searchResults = await postsModule.getSearchPosts({
                searchQuery: movieInfo.title,
                page: 1,
                providerValue: providerValue,
                signal: controller.signal,
                providerContext: providerContext,
            });
            clearTimeout(searchTimeout);
        } catch (error) {
            clearTimeout(searchTimeout);
            console.log(`  Search failed for ${providerValue}: ${error.message}`);
            return [];
        }

        if (!searchResults || searchResults.length === 0) {
            console.log(`  No search results for "${movieInfo.title}" on ${providerValue}`);
            return [];
        }

        console.log(`  Found ${searchResults.length} results on ${providerValue}`);

        // Step 3: Find the best match (first result or match by year)
        let bestMatch = searchResults[0];
        if (movieInfo.year) {
            const yearMatch = searchResults.find(r =>
                r.title?.includes(movieInfo.year) ||
                r.title?.toLowerCase().includes(movieInfo.title.toLowerCase())
            );
            if (yearMatch) bestMatch = yearMatch;
        }

        // Step 4: Get metadata/link for the movie
        const metaModuleCode = await downloadModule(providerValue, 'meta');
        let streamLink = bestMatch.link;
        let metaData = null;

        if (metaModuleCode) {
            try {
                console.log(`  Getting meta for ${providerValue}...`);
                const metaModule = executeModule(metaModuleCode);
                if (metaModule.getMeta) {
                    metaData = await metaModule.getMeta({
                        link: bestMatch.link,
                        provider: providerValue,
                        providerContext: providerContext,
                    });

                    // Get the stream link from metadata
                    if (metaData?.linkList?.length > 0) {
                        console.log(`  Found ${metaData.linkList.length} quality options for ${providerValue}`);
                        const linkItem = metaData.linkList[0];
                        if (linkItem.directLinks?.length > 0) {
                            streamLink = linkItem.directLinks[0].link;
                            console.log(`  Using direct link for ${providerValue}: ${streamLink?.substring(0, 50)}...`);
                        } else if (linkItem.episodesLink) {
                            streamLink = linkItem.episodesLink;
                            console.log(`  Using episodes link for ${providerValue}: ${streamLink?.substring(0, 50)}...`);
                        }
                    } else {
                        console.log(`  No linkList in meta for ${providerValue}`);
                    }
                }
            } catch (error) {
                console.log(`  Meta fetch failed for ${providerValue}: ${error.message}`);
                // Use the search result link directly
            }
        } else {
            console.log(`  No meta module for ${providerValue}, using search link directly`);
        }

        // Step 5: Get streams using the link
        const streamModuleCode = await downloadModule(providerValue, 'stream');
        if (!streamModuleCode) {
            console.log(`  No stream module for ${providerValue}`);
            return [];
        }

        const streamModule = executeModule(streamModuleCode);
        if (!streamModule.getStream) {
            console.log(`  No getStream function for ${providerValue}`);
            return [];
        }

        console.log(`  Getting streams for ${providerValue} from: ${streamLink?.substring(0, 60)}...`);
        const streamController = new AbortController();
        const streamTimeout = setTimeout(() => streamController.abort(), config.timeout.streamFetch);

        try {
            const streams = await streamModule.getStream({
                link: streamLink,
                type: params.type,
                signal: streamController.signal,
                providerContext: providerContext,
            });
            clearTimeout(streamTimeout);
            console.log(`  Got ${streams?.length || 0} streams from ${providerValue}`);
            return streams || [];
        } catch (error) {
            clearTimeout(streamTimeout);
            console.log(`  Stream fetch failed for ${providerValue}: ${error.message}`);
            return [];
        }
    } catch (error) {
        console.error(`Error getting streams from ${providerValue} (search):`, error.message);
        return [];
    }
}

/**
 * Get streams from a provider (automatically chooses ID or search method)
 */
async function getStreamsFromProvider(providerValue, params, movieInfo = null) {
    // If it's an ID-based provider, use ID method
    if (idBasedProviders.includes(providerValue)) {
        return getStreamsFromProviderById(providerValue, params);
    }

    // For search-based providers, we need the movie title
    if (!movieInfo) {
        // Try to get title from Cinemeta
        movieInfo = await getTitleFromCinemeta(params.imdbId, params.type);
        if (!movieInfo) {
            console.log(`  Could not get title for ${params.imdbId}, skipping search-based providers`);
            return [];
        }
    }

    return getStreamsFromProviderBySearch(providerValue, params, movieInfo);
}

/**
 * Get streams from all enabled providers
 * @param {object} params - Stream parameters
 * @param {Array} providers - Optional list of providers to use (for user configuration)
 * @returns {Promise<Array>} - Combined array of streams from all providers
 */
async function getStreamsFromAllProviders(params, providers = null) {
    const allStreams = [];

    // Use provided providers list or fall back to config
    const providersToUse = providers || config.enabledProviders;

    // Get movie info first (for search-based providers)
    console.log('Getting movie title from Cinemeta...');
    const movieInfo = await getTitleFromCinemeta(params.imdbId, params.type);
    if (movieInfo) {
        console.log(`Movie: "${movieInfo.title}" (${movieInfo.year || 'Unknown year'})`);
    } else {
        console.log('Could not get movie title, only ID-based providers will work');
    }

    // Separate ID-based and search-based providers
    const idProviders = providersToUse.filter(p => idBasedProviders.includes(p.value));
    const searchProviders = providersToUse.filter(p => !idBasedProviders.includes(p.value));

    // Fetch from ID-based providers first (faster)
    console.log(`\nFetching from ${idProviders.length} ID-based providers...`);
    const idProviderPromises = idProviders.map(async (provider) => {
        try {
            console.log(`  ${provider.displayName}...`);
            const streams = await getStreamsFromProviderById(provider.value, params);
            return streams.map(stream => ({
                ...stream,
                providerName: provider.displayName,
                providerValue: provider.value,
            }));
        } catch (error) {
            console.error(`  ${provider.displayName} failed:`, error.message);
            return [];
        }
    });

    // Only fetch from search-based providers if we have movie info
    let searchProviderPromises = [];
    if (movieInfo && searchProviders.length > 0) {
        console.log(`\nFetching from ${searchProviders.length} search-based providers...`);

        // Limit concurrent search requests to avoid overloading
        const limitedSearchProviders = searchProviders.slice(0, 5); // Only try first 5 for now

        searchProviderPromises = limitedSearchProviders.map(async (provider) => {
            try {
                console.log(`  ${provider.displayName}...`);
                const streams = await getStreamsFromProviderBySearch(provider.value, params, movieInfo);
                return streams.map(stream => ({
                    ...stream,
                    providerName: provider.displayName,
                    providerValue: provider.value,
                }));
            } catch (error) {
                console.error(`  ${provider.displayName} failed:`, error.message);
                return [];
            }
        });
    }

    // Wait for all providers
    const allPromises = [...idProviderPromises, ...searchProviderPromises];
    const results = await Promise.allSettled(allPromises);

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            allStreams.push(...result.value);
        }
    }

    return allStreams;
}

module.exports = {
    getStreamsFromProvider,
    getStreamsFromAllProviders,
    getStreamsFromProviderById,
    getStreamsFromProviderBySearch,
    getTitleFromCinemeta,
    downloadModule,
    executeModule,
};
