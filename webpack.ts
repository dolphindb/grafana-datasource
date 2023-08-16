import { fileURLToPath } from 'url'

import dayjs from 'dayjs'

import { default as Webpack, type Compiler, type Configuration, type Stats } from 'webpack'

import type { RawSourceMap } from 'source-map'

// 需要分析 bundle 大小时开启
// import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

import type { Options as TSLoaderOptions } from 'ts-loader'

import type { Options as SassOptions } from 'sass-loader'


import { fcopy, fexists, fread, fwrite, Lock } from 'xshell'


export const fpd_root = fileURLToPath(import.meta.url).fdir

export const ramdisk = fexists('T:/TEMP/', { print: false })
export const fpd_ramdisk_root = 'T:/2/ddb/gfn/'

export const fpd_out = `${ramdisk ? fpd_ramdisk_root : fpd_root}out/`


export async function copy_files () {
    await Promise.all([
        ... ([
            'plugin.json',
            'logo.svg',
            'demo.png',
            'ddb.svg',
            'README.zh.md'
        ] as const).map(async fname => 
            fcopy(fpd_root + fname, fpd_out + fname)
        ),
        fwrite(
            `${fpd_out}README.md`,
            (await fread(`${fpd_root}README.md`))
                .replaceAll('./README.zh.md', 'https://github.com/dolphindb/grafana-datasource/blob/main/README.zh.md')
                .replaceAll('./demo.png', '/public/plugins/dolphindb-datasource/demo.png')
                .replaceAll('./ddb.svg', '/public/plugins/dolphindb-datasource/ddb.svg')
        ),
        ... (['zh', 'en']).map(async language => 
            fcopy(`${fpd_root}node_modules/dolphindb/docs.${language}.json`, `${fpd_out}docs.${language}.json`, { overwrite: true })),
        fcopy(`${fpd_root}node_modules/vscode-oniguruma/release/onig.wasm`, `${fpd_out}onig.wasm`),
    ])
}


async function get_config (production: boolean): Promise<Configuration> {
    const sass = await import('sass')
    
    return {
        name: 'gfn',
        
        mode: production ? 'production' : 'development',
        
        devtool: 'source-map',
        
        entry: {
            'module.js': './index.tsx',
        },
        
        experiments: {
            outputModule: true,
        },
        
        target: ['web', 'es2023'],
        
        output: {
            path: fpd_out,
            filename: '[name]',
            publicPath: '/',
            pathinfo: true,
            globalObject: 'globalThis',
            module: false,
            // grafana 插件会被 SystemJS 加载，最后需要编译生成 define(['依赖'], function (dep) {  }) 这样的格式
            library: {
                type: 'amd'
            },
        },
        
        // externalsType: 'global',
        
        externals: [
            'react',
            'react-dom',
            '@grafana/runtime',
            '@grafana/data',
            '@grafana/ui',
        ],
        
        
        resolve: {
            extensions: ['.js'],
            
            symlinks: true,
            
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
                    use: ['style-loader', 'css-loader']
                },
                {
                    oneOf: [
                        {
                            test: /\.icon\.svg$/,
                            issuer: /\.[jt]sx?$/,
                            loader: '@svgr/webpack',
                            options: { icon: true }
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
            new Webpack.DefinePlugin({
                BUILD_TIME: dayjs().format('YYYY.MM.DD HH:mm:ss').quote()
            }),
            
            ... await (async () => {
                if (production) {
                    const { LicenseWebpackPlugin } = await import('license-webpack-plugin')
                    const ignoreds = new Set(['xshell', 'react-object-model', '@ant-design/icons-svg', '@ant-design/pro-layout', '@ant-design/pro-provider', 'toggle-selection'])
                    return [
                        new LicenseWebpackPlugin({
                            perChunkOutput: false,
                            outputFilename: 'ThirdPartyNotice.txt',
                            excludedPackageTest: pkgname => ignoreds.has(pkgname),
                        }) as any
                    ]
                } else
                    return [ ]
            })(),
            
            
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
        
        cache: {
            type: 'filesystem',
            
            ... ramdisk ? {
                cacheDirectory: `${fpd_ramdisk_root}webpack/`,
                compression: false
            } : {
                compression: 'brotli',
            }
        },
        
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
            
            children: false,
            
            assets: true,
            assetsSpace: 20,
            
            modules: false,
            modulesSpace: 20,
            
            cachedAssets: false,
            cachedModules: false,
        },
    }
}


export let webpack = {
    lcompiler: new Lock<Compiler>(null),
    
    
    async init (production: boolean) {
        this.lcompiler.resource = Webpack(await get_config(production))
        
        const { default: { SourceMapSource } } = await import('webpack-sources')
        
        // 删除 import 注释防止 SystemJS 加载模块失败
        // https://github.com/systemjs/systemjs/issues/1752
        this.lcompiler.resource.hooks.compilation.tap('PrepareRemoveImportCommentForCompilation', (compilation, params) => {
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
    },
    
    
    async run (production: boolean) {
        return this.lcompiler.request(async compiler => {
            if (!compiler) {
                await this.init(production)
                compiler = this.lcompiler.resource
            }
            
            return new Promise<Stats>((resolve, reject) => {
                compiler.run((error, stats) => {
                    if (stats)
                        console.log(
                            stats.toString(compiler.options.stats)
                                .replace(/\n\s*.*gfn.* compiled .*successfully.* in (.*)/, '\n编译成功，用时 $1'.green)
                        )
                    
                    if (error)
                        reject(error)
                    else if (stats.hasErrors())
                        reject(new Error('编译失败'))
                    else
                        resolve(stats)
                })
            })
        })
    },
    
    
    async close () {
        await this.lcompiler.request(async compiler =>
            new Promise<void>((resolve, reject) => {
                compiler.close(error => {
                    if (error)
                        reject(error)
                    else
                        resolve()
                })
            })
        )
    },
    
    
    async build () {
        await this.run(true)
        
        await this.close()
    }
}
