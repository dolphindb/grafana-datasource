import './index.sass'

import { default as React, useRef } from 'react'

import { Resizable } from 're-resizable'

import { getTemplateSrv } from '@grafana/runtime'
import {
    DataSourcePlugin,
    DataSourceApi,
    MutableDataFrame,
    FieldType,
    type DataQuery,
    type DataQueryRequest,
    type DataSourcePluginOptionsEditorProps,
    type DataSourceInstanceSettings,
    type DataQueryResponse,
    type QueryEditorProps,
    type DataSourceJsonData,
    type MetricFindValue,
    type FieldDTO,
} from '@grafana/data'
import {
    CodeEditor,
    InlineField,
    Input,
    InlineSwitch,
    Button,
    useTheme2
} from '@grafana/ui'

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

import {
    DDB,
    DdbType,
    DdbForm,
    type DdbObj,
    format,
    datetime2ms,
    month2ms,
    minute2ms,
    date2ms,
    datehour2ms,
    second2ms,
    time2ms,
    timestamp2ms,
    nanotime2ns,
    nanotimestamp2ns,
    nulls,
    type DdbVectorValue,
    type DdbValue,
    type DdbSymbolExtendedValue,
} from 'dolphindb/browser.js'
import { keywords, constants } from 'dolphindb/language.js'

// LOCAL
// import docs from 'dolphindb/docs.zh.json'
import docs_zh from 'dolphindb/docs.zh.json'
import docs_en from 'dolphindb/docs.en.json'


import { t, language } from './i18n/index.js'


const docs = language === 'zh' ? docs_zh : docs_en

const constants_lower = constants.map(constant => 
    constant.toLowerCase())

const funcs = Object.keys(docs)
const funcs_lower = funcs.map(func => 
    func.toLowerCase())


console.log(t('DolphinDB Grafana 插件已加载'))



/** DDB constructor 所需参数 */
interface DataSourceConfig extends DataSourceJsonData {
    url?: string
    autologin?: boolean
    username?: string
    password?: string
    python?: boolean
}

interface DdbDataQuery extends DataQuery {
    code: string
}


let decoder = new TextDecoder()

function var_formatter (value: string | string[], variable: any, default_formatter: Function) {
    if (typeof value === 'string')
        return value
    
    if (Array.isArray(variable))
        return JSON.stringify(variable)
    
    return default_formatter(value, 'json', variable)
}

class DataSource extends DataSourceApi<DdbDataQuery, DataSourceConfig> {
    settings: DataSourceInstanceSettings<DataSourceConfig>
    
    ddb: DDB
    
    
    constructor (settings: DataSourceInstanceSettings<DataSourceConfig>) {
        super(settings)
        
        console.log('new DolphinDB.DataSource:', settings)
        
        this.settings = settings
        
        const { url, ...options } = settings.jsonData
        
        this.ddb = new DDB(url, options)
    }
    
    
    override async testDatasource () {
        console.log('test datasource')
        
        try {
            await this.ddb.connect()
            return {
                status: 'success',
                message: t('已连接到数据库')
            }
        } catch (error) {
            console.error(error)
            error.message = t(
                '{{message}};\n无法通过 WebSocket 连接到 {{url}}，请检查 url, DataSource 配置、网络连接状况 (是否配置代理，代理是否支持 WebSocket)、server 是否启动、server 版本不低于 1.30.16 或 2.00.4',
                {
                    url: this.ddb.url,
                    message: error.message
                }
            )
            throw error
        }
    }
    
    
    override async query (request: DataQueryRequest<DdbDataQuery>): Promise<DataQueryResponse> {
        console.log('query.request:', request)
        
        const {
            range: {
                from,
                to,
            },
            targets: queries,
        } = request
        
        
        return {
            data: await Promise.all(
                queries.map(async query => {
                    const { refId, hide } = query
                    
                    let { code } = query
                    
                    code ||= ''
                    
                    console.log(`${refId}.query:`, query)
                    
                    if (hide || !code.trim())
                        return new MutableDataFrame({ refId, fields: [ ] })
                    
                    const code_ = getTemplateSrv()
                        .replace(
                            code.replaceAll(
                                /\$(__)?timeFilter\b/g,
                                'pair(' +
                                    from.format('YYYY.MM.DD HH:mm:ss.SSS') + 
                                    ', ' +
                                    to.format('YYYY.MM.DD HH:mm:ss.SSS') +
                                ')'
                            ),
                            { },
                            var_formatter
                        )
                    
                    console.log(`${refId}.code:`)
                    console.log(code_)
                    
                    const table = await this.ddb.eval<DdbObj<DdbObj<DdbVectorValue>[]>>(code_)
                    
                    if (table.form !== DdbForm.table)
                        throw new Error(t('Query 代码的最后一条语句需要返回 table，实际返回的是: {{value}}', { value: table.toString() }))
                    
                    return new MutableDataFrame({
                        refId,
                        
                        fields: table.value.map(col => {
                            const { type, value, rows, name } = col
                            
                            switch (type) {
                                // --- boolean
                                case DdbType.bool:
                                    return {
                                        name,
                                        type: FieldType.boolean,
                                        values: [...value as Uint8Array]
                                    }
                                
                                
                                // --- string
                                case DdbType.string:
                                case DdbType.symbol:
                                    return {
                                        name,
                                        type: FieldType.string,
                                        values: value
                                    }
                                
                                case DdbType.symbol_extended:
                                case DdbType.char:
                                case DdbType.uuid:
                                case DdbType.int128:
                                case DdbType.ipaddr:
                                case DdbType.blob:
                                case DdbType.complex:
                                case DdbType.point:
                                    return {
                                        name,
                                        type: FieldType.string,
                                        values: (() => {
                                            let values = new Array(rows)
                                            
                                            for (let i = 0; i < rows; i++)
                                                values[i] = this.formati(col, i)
                                            
                                            return values
                                        })()
                                    }
                                
                                
                                // --- time
                                case DdbType.date:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => date2ms(x))
                                    }
                                
                                case DdbType.month:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => month2ms(x))
                                    }
                                
                                case DdbType.time:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => time2ms(x))
                                    }
                                
                                case DdbType.minute:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => minute2ms(x))
                                    }
                                
                                case DdbType.second:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => second2ms(x))
                                    }
                                
                                case DdbType.datetime:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => datetime2ms(x))
                                    }
                                
                                case DdbType.timestamp:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as BigInt64Array].map(x => timestamp2ms(x))
                                    }
                                
                                case DdbType.nanotime:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as BigInt64Array].map(x => Number(nanotime2ns(x)) / 1000000)
                                    }
                                
                                case DdbType.nanotimestamp:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as BigInt64Array].map(x => Number(nanotimestamp2ns(x)) / 1000000)
                                    }
                                
                                case DdbType.datehour:
                                    return {
                                        name,
                                        type: FieldType.time,
                                        values: [...value as Int32Array].map(x => datehour2ms(x))
                                    }
                                
                                
                                // --- number
                                case DdbType.short:
                                    return {
                                        name,
                                        type: FieldType.number,
                                        values: [...value as Int16Array].map(x => x === nulls.int16 ? null : x)
                                    }
                                
                                case DdbType.int:
                                    return {
                                        name,
                                        type: FieldType.number,
                                        values: [...value as Int32Array].map(x => x === nulls.int32 ? null : x)
                                    }
                                
                                case DdbType.float:
                                    return {
                                        name,
                                        type: FieldType.number,
                                        values: [...value as Float32Array].map(x => x === nulls.float32 ? null : x)
                                    }
                                
                                case DdbType.double:
                                    return {
                                        name,
                                        type: FieldType.number,
                                        values: [...value as Float64Array].map(x => x === nulls.double ? null : x)
                                    }
                                
                                case DdbType.long:
                                    return {
                                        name,
                                        type: FieldType.number,
                                        values: [...(value as BigInt64Array)].map(x => x === nulls.int64 ? null : Number(x))
                                    }
                                
                                
                                // --- other
                                default:
                                    return {
                                        name,
                                        type: FieldType.other,
                                        values: value
                                    }
                            }
                        }) as FieldDTO[]
                    })
                })
            ),
        }
    }
    
    
    override async metricFindQuery (query: string, options: any): Promise<MetricFindValue[]> {
        console.log('metricFindQuery:', { query, options })
        
        const result = await this.ddb.eval(
            getTemplateSrv()
                .replace(query, { }, var_formatter)
        )
        
        // 标量直接返回含有该标量的数组
        // 向量返回对应数组
        // 含有一个向量的 table 取其中的向量映射为数组
        // 其它情况报错
        
        // expandable 是什么？
        
        switch (result.form) {
            case DdbForm.scalar: {
                switch (result.type) {
                    case DdbType.string:
                        return [{
                            text: result.value as string,
                            value: result.value as string | number,
                        }]
                        
                    case DdbType.char: {
                        let text = format(DdbType.char, result.value, result.le)
                        text = text.startsWith("'") ?
                                text.slice(1, -1)
                            :
                                text
                        
                        return [{
                            text,
                            value: text,
                        }]
                    }
                    
                    default: {
                        const text = format(result.type, result.value, result.le)
                        return [{
                            text: text,
                            value: text,
                        }]
                    }
                }
            }
            
            case DdbForm.vector: 
            case DdbForm.pair: 
            case DdbForm.set: {
                let values = new Array(result.rows)
                
                for (let i = 0; i < result.rows; i++) {
                    const text = this.formati(result, i)
                    
                    values[i] = {
                        text: text,
                        value: text,
                    }
                }
                
                return values
            }
            
            case DdbForm.table: {
                if ((result as DdbObj<DdbObj[]>).value.length === 1) {
                    let values = new Array(result.value[0].rows)
                    
                    for (let i = 0; i < result.value[0].rows; i++) {
                        const text = this.formati(result.value[0], i)
                        
                        values[i] = {
                            text: text,
                            value: text,
                            expandable: true
                        }
                    }
                    
                    return values
                } else
                    throw new Error(t('Query 的返回值不是标量、向量或只含一个向量的表格'))
            }
            
            default:
                throw new Error(t('Query 的返回值不是标量、向量或只含一个向量的表格'))
        }
    }
    
    
    formati (obj: DdbObj<DdbValue>, index: number): string {
        switch (obj.type) {
            case DdbType.string:
            case DdbType.symbol:
                return obj.value[index]
            
            case DdbType.char: {
                const c = format(DdbType.char, obj.value[index], obj.le)
                return c.startsWith("'") ?
                    c.slice(1, -1)
                :
                    c
            }
            
            case DdbType.symbol_extended: {
                const { base, data } = obj.value as DdbSymbolExtendedValue
                return base[data[index]]
            }
            
            case DdbType.uuid:
            case DdbType.int128:
            case DdbType.ipaddr:
                return format(
                    obj.type,
                    (obj.value as Uint8Array).subarray(16 * index, 16 * (index + 1)),
                    obj.le
                )
            
            case DdbType.blob: {
                const value = (obj.form === DdbForm.scalar ? obj.value : obj.value[index]) as Uint8Array

                return value.length > 100 ?
                    decoder.decode(
                        value.subarray(0, 98)
                    ) + '…'
                    :
                    decoder.decode(value)
            }
            
            case DdbType.complex:
            case DdbType.point:
                return format(
                    obj.type,
                    (obj.value as Float64Array).subarray(2 * index, 2 * (index + 1)),
                    obj.le
                )
            
            default:
                return format(
                    obj.type,
                    obj.form === DdbForm.scalar ? obj.value : obj.value[index],
                    obj.le
                )
        }
    }
}


function ConfigEditor ({
    options,
    onOptionsChange
}: DataSourcePluginOptionsEditorProps<DataSourceConfig>) {
    options.jsonData.url ??= 'ws://127.0.0.1:8848'
    options.jsonData.autologin ??= true
    options.jsonData.username ??= 'admin'
    options.jsonData.password ??= '123456'
    options.jsonData.python ??= false
    
    return <div className='gf-form-group'>
        <InlineField 
            tooltip={t('数据库连接地址 (WebSocket URL), 如: ws://127.0.0.1:8848, wss://dolphindb.com (HTTPS 加密)')} 
            label='URL' 
            labelWidth={12}
        >
            <Input
                value={options.jsonData.url}
                onChange={e => {
                    onOptionsChange({
                        ...options,
                        jsonData: {
                            ...options.jsonData,
                            url: e.currentTarget.value
                        }
                    })
                }}
            />
        </InlineField>
        <br/>
 
        <InlineField tooltip={t('是否在建立连接后自动登录，默认 true')} label={t('自动登录')} labelWidth={12}>
            <InlineSwitch
                value={options.jsonData.autologin}
                onChange={e => {
                    onOptionsChange({
                        ...options,
                        jsonData: {
                            ...options.jsonData,
                            autologin: e.currentTarget.checked
                        }
                    })
                }}
            />
        </InlineField>
        <br/>
                
        {(options.jsonData.autologin || options.jsonData.autologin === undefined) && <>
            <InlineField tooltip={t('DolphinDB 登录用户名')} label={t('用户名')} labelWidth={12}>
                <Input
                    value={options.jsonData.username}
                    onChange={e => {
                        onOptionsChange({
                            ...options,
                            jsonData: {
                                ...options.jsonData,
                                username: e.currentTarget.value
                            }
                        })
                    }}
                />
            </InlineField>
            <br />
        </>}
        
        {(options.jsonData.autologin || options.jsonData.autologin === undefined) && <>
            <InlineField tooltip={t('DolphinDB 登录密码')} label={t('密码')} labelWidth={12}>
                <Input
                    type='password'
                    value={options.jsonData.password}
                    onChange={e => {
                        onOptionsChange({
                            ...options,
                            jsonData: {
                                ...options.jsonData,
                                password: e.currentTarget.value
                            }
                        })
                    }}
                />
            </InlineField>
            <br />
        </>}
        
        <InlineField tooltip={t('使用 Python Parser 来解释执行脚本, 默认 false')} label='Python' labelWidth={12}>
            <InlineSwitch
                value={options.jsonData.python}
                onChange={e => {
                    onOptionsChange({
                        ...options,
                        jsonData: {
                            ...options.jsonData,
                            python: e.currentTarget.checked
                        }
                    })
                }}
            />
        </InlineField>
        
        {/* <div className='options'>
            { JSON.stringify(options) }
        </div> */}
    </div>
}


function QueryEditor (
    {
        height = 260,
        query: {
            code,
            refId
        },
        onChange,
        onRunQuery,
    }: QueryEditorProps<DataSource, DdbDataQuery, DataSourceJsonData> & { height?: number }
) {
    const { isDark } = useTheme2()
    
    return <div className='query-editor'>
        {/* <div>
            <FormField width={4} label='Constant' type='number' step='0.1' />
            <FormField labelWidth={8} label='Query Text' tooltip='Not used yet' />
        </div> */}
        
        <Resizable
            className='resizable'
            defaultSize={{ height, width: 'auto' }}
            enable={{ top: false, right: false, bottom: true, left:false, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false }}
        >
            <CodeEditor
                height='100%'
                
                language='dolphindb'
                
                showLineNumbers
                
                value=''
                
                monacoOptions={{
                    minimap: {
                        enabled: false
                    },
                    
                    fontFamily: 'MyFont',
                    fontSize: 16,
                    insertSpaces: true,
                    codeLensFontFamily: 'MyFont',
                    folding: true,
                    largeFileOptimizations: true,
                    matchBrackets: 'always',
                    smoothScrolling: false,
                    suggest: {
                        insertMode: 'replace',
                        snippetsPreventQuickSuggestions: false,
                    },
                    
                    wordBasedSuggestions: true,
                    
                    mouseWheelZoom: true,
                    guides: {
                        indentation: false,
                        bracketPairs: false,
                        highlightActiveIndentation: false,
                    },
                    
                    detectIndentation: true,
                    tabSize: 4,
                    
                    codeLens: true,
                    roundedSelection: false,
                    wordWrap: 'on',
                    
                    scrollBeyondLastLine: false,
                    scrollbar: {
                        vertical: 'visible'
                    },
                    
                    find: {
                        loop: true,
                        seedSearchStringFromSelection: 'selection',
                    },
                    
                    acceptSuggestionOnCommitCharacter: false,
                    
                    mouseWheelScrollSensitivity: 2,
                    dragAndDrop: false,
                    renderControlCharacters: true,
                    lineNumbers: 'on',
                    showFoldingControls: 'mouseover',
                    foldingStrategy: 'indentation',
                    accessibilitySupport: 'off',
                    autoIndent: 'advanced',
                    snippetSuggestions: 'none',
                    renderLineHighlight: 'none',
                    trimAutoWhitespace: false,
                    hideCursorInOverviewRuler: true,
                    renderWhitespace: 'none',
                    overviewRulerBorder: true,
                    
                    gotoLocation: {
                        multipleDeclarations: 'peek',
                        multipleTypeDefinitions: 'peek',
                        multipleDefinitions: 'peek',
                    },
                    
                    foldingHighlight: false,
                    unfoldOnClickAfterEndOfLine: true,
                    
                    inlayHints: {
                        enabled: false,
                    },
                    
                    acceptSuggestionOnEnter: 'off',
                    
                    quickSuggestions: {
                        other: true,
                        comments: true,
                        strings: true,
                    },
                }}
                
                onBeforeEditorMount={monaco => {
                    if ((monaco as any).inited)
                        return
                    
                    let { languages, editor } = monaco
                    const { CompletionItemKind } = languages
                    
                    languages.register({
                        id: 'dolphindb',
                        // configuration: ''
                    })
                    
                    languages.setMonarchTokensProvider('dolphindb', {
                        defaultToken: 'invalid',
                        
                        keywords,
                        
                        operators: [
                            '||', '&&',
                            '<=', '==', '>=', '!=',
                            '<<', '>>',
                            '**', '<-', '->', '..',
                            '<', '>', '|', '^', '&', '+', '-', '*', '/', '\\', '%', '$', ':', '!', '.'
                        ],
                        
                        tokenizer: {
                            root: [
                                [/\/\/.*$/, 'comment'],
                                
                                [/'(.*?)'/, 'string'],
                                [/"(.*?)"/, 'string'],
                                
                                [/\w+!? ?(?=\()/, 'call'],
                                
                                [/\d+/, 'number'],
                                
                                [/\w+( join| by)?/, { cases: { '@keywords': 'keyword' } }],
                                
                                [/[!$%^&*|<=>\\.]+/, { cases: { '@operators': 'operator' } }],
                                
                                [/[;,.]/, 'delimiter'],
                            ],
                        },
                    })
                    
                    editor.defineTheme('dolphindb-theme', {
                        base: isDark ? 'vs-dark' : 'vs',
                        inherit: true,
                        rules: isDark ?
                                [
                                    { token: 'call',  foreground: '#dcdcaa', fontStyle: 'bold' },
                                    { token: 'operator', foreground: '#d4d4d4' },
                                    { token: 'invalid', foreground: '#d4d4d4' },
                                ]
                            :
                                [
                                    // { token: 'keywords.dolphindb', foreground: '#ff0000' }
                                    { token: 'comment', foreground: '#000000' },
                                    { token: 'types', foreground: '#0f96be' },
                                    { token: 'operator', foreground: '#ff0000' },
                                    { token: 'invalid', foreground: '#000000' },
                                    { token: 'keyword', foreground: '#af00db' },
                                    { token: 'number', foreground: '#00a000' },
                                    { token: 'call',  foreground: '#000000', fontStyle: 'bold' },
                                ],
                        colors: {
                            
                        }
                    })
                    
                    editor.setTheme('dolphindb-theme')
                    
                    languages.setLanguageConfiguration('dolphindb', {
                        comments: {
                            // symbol used for single line comment. Remove this entry if your language does not support line comments
                            lineComment: '//',
                            
                            // symbols used for start and end a block comment. Remove this entry if your language does not support block comments
                            blockComment: ['/*', '*/']
                        },
                        
                        // symbols used as brackets
                        brackets: [
                            ['{', '}'],
                            ['[', ']'],
                            ['(', ')']
                        ],
                        
                        // symbols that are auto closed when typing
                        autoClosingPairs: [
                            { open: '{', close: '}' },
                            { open: '[', close: ']' },
                            { open: '(', close: ')' },
                            { open: '"', close: '"', notIn: ['string'] },
                            { open: "'", close: "'", notIn: ['string'] },
                            { open: '/**', close: ' */', notIn: ['string'] },
                            { open: '/*', close: ' */', notIn: ['string'] }
                        ],
                        
                        // symbols that that can be used to surround a selection
                        surroundingPairs: [
                            { open: '{', close: '}' },
                            { open: '[', close: ']' },
                            { open: '(', close: ')' },
                            { open: '"', close: '"' },
                            { open: "'", close: "'" },
                            { open: '<', close: '>' },
                        ],
                        
                        folding: {
                            markers: {
                                start: new RegExp('^\\s*//\\s*#?region\\b'),
                                end: new RegExp('^\\s*//\\s*#?endregion\\b')
                            }
                        },
                        
                        wordPattern: new RegExp('(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\\'\\"\\,\\.\\<\\>\\/\\?\\s]+)'),
                        
                        indentationRules: {
                            increaseIndentPattern: new RegExp('^((?!\\/\\/).)*(\\{[^}"\'`]*|\\([^)"\'`]*|\\[[^\\]"\'`]*)$'),
                            decreaseIndentPattern: new RegExp('^((?!.*?\\/\\*).*\\*/)?\\s*[\\}\\]].*$')
                        }
                    })
                    
                    languages.registerCompletionItemProvider('dolphindb', {
                        provideCompletionItems (doc, pos, ctx, canceller) {
                            if (canceller.isCancellationRequested)
                                return
                            
                            const keyword = doc.getWordAtPosition(pos).word
                            
                            
                            let fns: string[]
                            let _constants: string[]
                            
                            if (keyword.length === 1) {
                                const c = keyword[0].toLowerCase()
                                fns = funcs.filter((func, i) => 
                                    funcs_lower[i].startsWith(c)
                                )
                                _constants = constants.filter((constant, i) => 
                                    constants_lower[i].startsWith(c)
                                )
                            } else {
                                const keyword_lower = keyword.toLowerCase()
                                
                                fns = funcs.filter((func, i) => {
                                    const func_lower = funcs_lower[i]
                                    let j = 0
                                    for (const c of keyword_lower) {
                                        j = func_lower.indexOf(c, j) + 1
                                        if (!j)  // 找不到则 j === 0
                                            return false
                                    }
                                    
                                    return true
                                })
                                
                                _constants = constants.filter((constant, i) => {
                                    const constant_lower = constants_lower[i]
                                    let j = 0
                                    for (const c of keyword_lower) {
                                        j = constant_lower.indexOf(c, j) + 1
                                        if (!j)  // 找不到则 j === 0
                                            return false
                                    }
                                    
                                    return true
                                })
                            }
                            
                            return {
                                suggestions: [
                                    ...keywords.filter(kw => 
                                        kw.startsWith(keyword)
                                    ).map(kw => ({
                                        label: kw,
                                        insertText: kw,
                                        kind: CompletionItemKind.Keyword,
                                    }) as monaco.languages.CompletionItem),
                                    ... _constants.map(constant => ({
                                        label: constant,
                                        insertText: constant,
                                        kind: CompletionItemKind.Constant
                                    }) as monaco.languages.CompletionItem),
                                    ...fns.map(fn => ({
                                        label: fn,
                                        insertText: fn,
                                        kind: CompletionItemKind.Function,
                                    }) as monaco.languages.CompletionItem),
                                ]
                            }
                        },
                        
                        resolveCompletionItem (item, canceller) {
                            if (canceller.isCancellationRequested)
                                return
                            
                            item.documentation = get_func_md(item.label as string)
                            
                            return item
                        }
                    })
                    
                    languages.registerHoverProvider('dolphindb', {
                        provideHover (doc, pos, canceller) {
                            if (canceller.isCancellationRequested)
                                return
                            
                            const word = doc.getWordAtPosition(pos)
                            
                            if (!word)
                                return
                            
                            const md = get_func_md(word.word)
                            
                            if (!md)
                                return
                            
                            return {
                                contents: [md]
                            }
                        }
                    })
                    
                    languages.registerSignatureHelpProvider('dolphindb', {
                        signatureHelpTriggerCharacters: ['(', ','],
                        
                        provideSignatureHelp (doc, pos, canceller, ctx) {
                            if (canceller.isCancellationRequested)
                                return
                            
                            const { func_name, param_search_pos } = find_func_start(doc, pos)
                            if (param_search_pos === -1) 
                                return
                            
                            const index = find_active_param_index(doc, pos, param_search_pos)
                            if (index === -1) 
                                return
                            
                            const signature_and_params = get_signature_and_params(func_name)
                            if (!signature_and_params)
                                return
                            
                            const { signature, params } = signature_and_params
                            
                            return {
                                dispose () { },
                                
                                value: {
                                    activeParameter: index > params.length - 1 ? params.length - 1 : index,
                                    signatures: [{
                                        label: signature,
                                        documentation: get_func_md(func_name),
                                        parameters: params.map(param => ({
                                            label: param
                                        }))
                                    }],
                                    activeSignature: 0,
                                }
                            }
                        }
                    })
                    
                    ;(monaco as any).inited = true
                }}
                
                { ... onRunQuery ? {
                    onSave (code) {
                        onRunQuery()
                    }
                } : { } }
                
                onEditorDidMount={(editor, monaco) => {
                    editor.setValue(code || '')
                    
                    editor.getModel().onDidChangeContent((event) => {
                        onChange({
                            refId,
                            code: editor.getValue().replaceAll('\r\n', '\n')
                        })
                    })
                    
                    monaco.editor.setTheme('dolphindb-theme')
                    
                    let { widget } = editor.getContribution('editor.contrib.suggestController') as any
                    
                    if (widget) {
                        const { value: suggest_widget } = widget
                        suggest_widget._setDetailsVisible(true)
                        // suggest_widget._persistedSize.store({
                        //     width: 200,
                        //     height: 256
                        // })
                    }
                }}
            />
        </Resizable>
    </div>
}


function VariableQueryEditor ({
    query,
    onChange,
}: {
    query: string
    onChange (query: string, definition: string): void
}) {
    const rquery = useRef(query)
    
    return <div className='variable-query-editor'>
        <InlineField grow label='Query' labelWidth={20} tooltip={t('通过执行脚本生成变量选项，脚本的最后一条语句应返回标量、向量、或者只含一个向量的表格')}>
            <>
                {/* @ts-ignore */}
                <QueryEditor
                    height={200}
                    query={{ code: query, refId: 'variable' }}
                    onChange={({ code }) => {
                        rquery.current = code
                    }}
                />
                <div className='query-actions'>
                    <Button
                        className='save-button'
                        icon='save'
                        onClick={ e => {
                            e.preventDefault()
                            const { current: query } = rquery
                            console.log('save query', query)
                            onChange(query, query)
                        }
                    }>{t('暂存查询并更新预览')}</Button>
                </div>
            </>
        </InlineField>
    </div>
}


/** 最大搜索行数 */
const max_lines_to_match = 30 as const

// 栈 token 匹配表
const token_map = {
    ')': '(',
    '}': '{',
    ']': '['
} as const

const token_ends = new Set(
    Object.values(token_map)
)

function get_func_md (keyword: string) {
    const func_doc = docs[keyword]
    
    if (!func_doc)
        return
    
    let str = 
        // 标题
        `#### ${func_doc.title}\n` +
        
        // 链接
        `https://www.dolphindb.cn/cn/help/FunctionsandCommands/${ func_doc.type === 'command' ? 'CommandsReferences' : 'FunctionReferences' }/${func_doc.title[0]}/${func_doc.title}.html\n`
    
    
    for (const para of func_doc.children) {
        // 加入段
        str += `#### ${para.title}\n`
        
        for (const x of para.children)
            if (x.type === 'text' && para.type !== 'example') 
                // 对于参数段落，以 markdown 插入
                str += x.value.join_lines()
            else
                // x.type === 'code' || para.type === 'example'
                str += 
                    '```' + (x.language === 'console' ? 'dolphindb' : (x.language || '')) + '\n' +
                    x.value.join_lines() +
                    '```\n'
        
        str += '\n'
    }
    
    return {
        isTrusted: true,
        value: str
    } as monaco.IMarkdownString
}


/** 利用当前光标找出函数参数开始位置及函数名, 若找不到返回 -1 */
function find_func_start (
    document: monaco.editor.ITextModel,
    position: monaco.Position
): {
    func_name: string
    param_search_pos: number
} {
    const func_name_regex = /[a-z|A-Z|0-9|\!|_]/
    
    const text = document.getValueInRange({
        startLineNumber: Math.max(position.lineNumber - max_lines_to_match, 0),
        startColumn: 0,
        endLineNumber: position.lineNumber,
        endColumn: position.column
    })
    
    
    let stack_depth = 0
    let param_search_pos = -1
    for (let i = text.length; i >= 0; i--) {
        let char = text[i]
        // 遇到右括号，入栈，增加一层括号语境深度
        if (char === ')') {
            stack_depth++
            continue
        }
        // 遇到左括号，出栈，退出一层括号语境深度
        else if (char === '(') {
            stack_depth--
            continue
        }
        
        // 栈深度小于0，且遇到合法函数名字符，跳出括号语境，搜索结束：参数搜索开始位置
        if (func_name_regex.test(char) && stack_depth < 0) {
            param_search_pos = i
            break
        }
    }
    
    // 找不到参数搜索开始位置，返回null
    if (param_search_pos === -1) 
        return { param_search_pos: -1, func_name: '' }
    
    
    // 往前找函数名
    let func_name_end = -1
    let func_name_start = 0
    for (let i = param_search_pos; i >= 0; i--) {
        let char = text[i]
        
        // 空字符跳过
        if (func_name_end === -1 && char === ' ') 
            continue
        
        // 合法函数名字字符，继续往前找
        if (func_name_regex.test(char)) {
            // 标记函数名字末尾位置
            if (func_name_end === -1) 
                func_name_end = i
            
            continue
        }
        
        // 不合法函数名字符，标记函数名字开头位置
        func_name_start = i + 1
        break
    }
    
    // 找不到函数名
    if (func_name_end === -1) 
        return { param_search_pos: -1, func_name: '' }
    
    return {
        param_search_pos: param_search_pos + 1,
        func_name: text.slice(func_name_start, func_name_end + 1)
    }
}



/** 根据函数参数开始位置分析参数语义，提取出当前参数索引  */
function find_active_param_index (
    document: monaco.editor.ITextModel,
    position: monaco.Position,
    start: number
) {
    const text = document.getValueInRange({
        startLineNumber: Math.max(position.lineNumber - max_lines_to_match, 0),
        startColumn: 0,
        endLineNumber: position.lineNumber,
        endColumn: position.column
    })
    
    let index = 0
    let stack = []
    
    // 分隔符，此处为逗号
    const seperator = ','
    
    let ncommas = 0
    
    // 搜索
    for (let i = start; i < text.length; i++) {
        const char = text[i]
        
        // 空字符跳过
        if (/\s/.test(char)) 
            continue
        
        // 字符串内除引号全部忽略
        if (stack[stack.length - 1] === '"' || stack[stack.length - 1] === "'") {
            // 遇到相同引号，出栈
            if ((stack[stack.length - 1] === '"' && char === '"') || (stack[stack.length - 1] === "'" && char === "'")) 
                stack.pop()
            continue
        }
        
        // 开括号入栈
        if (token_ends.has(char as any) || char === '"' || char === "'") {
            stack.push(char)
            continue
        } else if (char in token_map)  // 括号匹配，出栈，括号不匹配，返回null
            if (stack[stack.length - 1] === token_map[char]) {
                stack.pop()
                continue
            } else // 括号不匹配，返回-1
                return -1
        
        // 栈深度为1 且为左小括号：当前语境
        if (stack.length === 1 && stack[0] === '(') 
            // 遇到逗号，若之前有合法参数，计入逗号
            if (char === seperator)
                ncommas++
        
        // 根据逗号数量判断高亮参数索引值
        index = ncommas
    }
    
    return index
}


/** 根据函数名提取出相应的文件对象，提取出函数signature和参数 */
function get_signature_and_params (func_name: string): {
    signature: string
    params: string[]
} | null {
    const para = docs[func_name]?.children.filter(para => para.type === 'grammer')[0]
    if (!para) 
        return null
    
    // 找出语法内容块的第一个非空行
    const funcLine = para.children[0].value.filter(line => line.trim() !== '')[0].trim()
    const matched = funcLine.match(/[a-zA-z0-9\!]+\((.*)\)/)
    if (!matched) 
        return null
    
    const signature = matched[0]
    const params = matched[1].split(',').map(s => s.trim())
    return { signature, params }
}


export const plugin = new DataSourcePlugin(DataSource)
    .setConfigEditor(ConfigEditor)
    .setQueryEditor(QueryEditor)
    .setVariableQueryEditor(VariableQueryEditor)
