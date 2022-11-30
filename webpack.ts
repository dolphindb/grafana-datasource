import { fileURLToPath } from 'url'
import path from 'upath'

import {
    default as Webpack,
    type Configuration,
    type Compiler,
    type Stats,
} from 'webpack'


import webpack_sources from 'webpack-sources'
const { SourceMapSource } = webpack_sources
import type { RawSourceMap } from 'source-map'

// 需要分析 bundle 大小时开启
// import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

import type { Options as TSLoaderOptions } from 'ts-loader'

import sass from 'sass'
import type { Options as SassOptions } from 'sass-loader'


import { fcopy, fread, fwrite } from 'xshell'


export const fpd_root = `${path.dirname(fileURLToPath(import.meta.url))}/`

export const fpd_out = `${fpd_root}out/`


export async function copy_files () {
    await Promise.all([
        ... ([
            'plugin.json',
            'logo.svg',
            'demo.png',
            'ddb.svg',
            'README.zh.md'
        ] as const).map(async fname => 
            fcopy(fpd_root + fname, fpd_out + fname))
        ,
        fwrite(
            `${fpd_out}README.md`,
            (await fread(`${fpd_root}README.md`))
                .replaceAll('./README.zh.md', 'https://github.com/dolphindb/grafana-datasource/blob/master/README.zh.md')
                .replaceAll('./demo.png', '/public/plugins/dolphindb-datasource/demo.png')
                .replaceAll('./ddb.svg', '/public/plugins/dolphindb-datasource/ddb.svg')
        ),
    ])
}



const config: Configuration = {
    name: 'DdbGrafana',
    
    mode: 'development',
    
    devtool: 'source-map',
    
    entry: {
        'module.js': './index.tsx',
    },
    
    externals: [
        'react',
        'react-dom',
        '@grafana/runtime',
        '@grafana/data',
        '@grafana/ui',
    ],
    
    experiments: {
        // outputModule: true,
        topLevelAwait: true,
    },
    
    output: {
        path: fpd_out,
        filename: '[name]',
        
        // grafana 插件会被 SystemJS 加载，最后需要编译生成 define(['依赖'], function (dep) {  }) 这样的格式
        library: {
            type: 'amd'
        },
        
        publicPath: '/',
        pathinfo: true,
        globalObject: 'globalThis',
    },
    
    target: ['web', 'es2022'],
    
    
    resolve: {
        extensions: ['.js'],
        
        symlinks: false,
        
        plugins: [{
            apply (resolver) {
                const target = resolver.ensureHook('file')
                
                for (const extension of ['.ts', '.tsx'] as const)
                    resolver.getHook('raw-file').tapAsync('ResolveTypescriptPlugin', (request, ctx, callback) => {
                        if (
                            typeof request.path !== 'string' ||
                            /(^|[\\/])node_modules($|[\\/])/.test(request.path)
                        ) {
                            callback()
                            return
                        }
                        
                        if (request.path.endsWith('.js')) {
                            const path = request.path.slice(0, -3) + extension
                            
                            resolver.doResolve(
                                target,
                                {
                                    ...request,
                                    path,
                                    relativePath: request.relativePath?.replace(/\.js$/, extension)
                                },
                                `using path: ${path}`,
                                ctx,
                                callback
                            )
                        } else
                            callback()
                    })
            }
        }]
    },
    
    
    module: {
        rules: [
            {
                test: /\.js$/,
                enforce: 'pre',
                use: ['source-map-loader'],
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
                // https://github.com/TypeStrong/ts-loader
                options: {
                    configFile: `${fpd_root}tsconfig.json`,
                    onlyCompileBundledFiles: true,
                    transpileOnly: true,
                } as Partial<TSLoaderOptions>
            },
            {
                test: /\.s[ac]ss$/,
                use: [
                    'style-loader',
                    {
                        // https://github.com/webpack-contrib/css-loader
                        loader: 'css-loader',
                        options: {
                            url: false,
                        }
                    },
                    {
                        // https://webpack.js.org/loaders/sass-loader
                        loader: 'sass-loader',
                        options: {
                            implementation: sass,
                            // 解决 url(search.png) 打包出错的问题
                            webpackImporter: false,
                            sassOptions: {
                                indentWidth: 4,
                            },
                        } as SassOptions,
                    }
                ]
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader',
                ]
            },
            {
                oneOf: [
                    {
                        test: /\.icon\.svg$/,
                        issuer: /\.[jt]sx?$/,
                        loader: '@svgr/webpack',
                        options: {
                            icon: true,
                        }
                    },
                    {
                        test: /\.(svg|ico|png|jpe?g|gif|woff2?|ttf|eot|otf|mp4|webm|ogg|mp3|wav|flac|aac)$/,
                        type: 'asset/inline',
                    },
                ]
            },
            {
                test: /\.txt$/,
                type: 'asset/source',
            }
        ],
    },
    
    
    plugins: [
        // new Webpack.DefinePlugin({
        //     process: { env: { }, argv: [] }
        // })
        
        // 需要分析 bundle 大小时开启
        // new BundleAnalyzerPlugin({ analyzerPort: 8880, openAnalyzer: false }),
    ],
    
    
    optimization: {
        minimize: false,
    },
    
    performance: {
        hints: false,
    },
    
    cache: false,
    
    ignoreWarnings: [
        /Failed to parse source map/
    ],
    
    stats: {
        colors: true,
        
        context: fpd_root,
        
        entrypoints: false,
        
        errors: true,
        errorDetails: true,
        
        hash: false,
        
        version: false,
        
        timings: true,
        
        children: true,
        
        cachedAssets: false,
        cachedModules: false,
    },
}

export let webpack = {
    compiler: null as Compiler,
    
    
    async build (production: boolean) {
        if (production)
            config.mode = 'production'
        
        this.compiler = Webpack(config)
        
        // 删除 import 注释防止 SystemJS 加载模块失败
        // https://github.com/systemjs/systemjs/issues/1752
        this.compiler.hooks.compilation.tap('PrepareRemoveImportCommentForCompilation', (compilation, params) => {
            compilation.hooks.processAssets.tap(
                {
                    name: 'RemoveImportComment',
                    stage: Webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY,
                },
                assets => {
                    compilation.updateAsset(
                        'module.js',
                        asset => {
                            const { source, map } = asset.sourceAndMap()
                            return new SourceMapSource(
                                (source as string).replaceAll(/import dict from '\.\/dict\.json'.*/g, ''),
                                'module.js',
                                map as RawSourceMap as any
                            )
                        }
                    )
                })
        })
        
        
        await new Promise<Stats>((resolve, reject) => {
            this.compiler.run((error, stats) => {
                if (stats)
                    console.log(stats.toString(config.stats))
                
                if (error)
                    reject(error)
                else if (stats.hasErrors())
                    reject(new Error('构建失败'))
                else
                    resolve(stats)
            })
        })
        
        await new Promise(resolve => {
            this.compiler.close(resolve)
        })
    }
}

