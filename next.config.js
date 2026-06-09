/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            { source: '/ig',      destination: '/?utm_source=instagram', permanent: false },
            { source: '/tt',      destination: '/?utm_source=tiktok',    permanent: false },
            { source: '/yt',      destination: '/?utm_source=youtube',   permanent: false },
            { source: '/threads', destination: '/?utm_source=threads',   permanent: false },
            { source: '/kakao',   destination: '/?utm_source=kakao',     permanent: false },
            { source: '/x',       destination: '/?utm_source=twitter',   permanent: false },
        ]
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
            {
                protocol: 'http',
                hostname: '**',
            },
        ],
    },
    serverExternalPackages: ['googleapis', 'sharp', 'ffmpeg-static', 'opentype.js'],
    outputFileTracingIncludes: {
        '/api/admin/shortform/[id]/generate': [
            './node_modules/ffmpeg-static/ffmpeg',
            './public/fonts/Pretendard-Bold.ttf',
            './public/whynali-logo.png',
        ],
    },
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.optimization = {
                ...config.optimization,
                splitChunks: {
                    chunks: 'all',
                    cacheGroups: {
                        default: false,
                        vendors: false,
                        framework: {
                            name: 'framework',
                            chunks: 'all',
                            test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
                            priority: 40,
                            enforce: true,
                        },
                        commons: {
                            name: 'commons',
                            minChunks: 2,
                            priority: 20,
                        },
                        lib: {
                            test(module) {
                                return (
                                    module.size() > 160000 &&
                                    /node_modules[/\\]/.test(module.identifier())
                                )
                            },
                            name(module) {
                                const hash = require('crypto').createHash('sha1')
                                hash.update(module.identifier())
                                return hash.digest('hex').substring(0, 8)
                            },
                            priority: 30,
                            minChunks: 1,
                            reuseExistingChunk: true,
                        },
                    },
                },
            }
        }
        return config
    },
}

module.exports = nextConfig
