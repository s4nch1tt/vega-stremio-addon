# Vega Stremio Addon

A Stremio addon that provides streams from multiple Vega providers.

## Features

- 🎬 31 streaming providers (MultiStream, VegaMovies, MoviesDrive, 4khdHub, etc.)
- 🔤 Built-in subtitle support
- ⚙️ Configurable provider selection
- 🔍 Title-based search for regional content

## Installation

### In Stremio

Add this URL to your Stremio addons:
```
https://YOUR-DEPLOYMENT-URL/manifest.json
```

### Local Development

```bash
npm install
npm start
```

The server will start at `http://127.0.0.1:7000/manifest.json`

## Deployment

### Render.com (Free)

1. Fork this repository to your GitHub
2. Go to [render.com](https://render.com)
3. Create a new Web Service
4. Connect your GitHub repository
5. Render will automatically detect the configuration
6. Your addon will be available at `https://your-app.onrender.com/manifest.json`

## Environment Variables

- `PORT` - Server port (default: 7000)

## License

MIT
