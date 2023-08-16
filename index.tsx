import './index.sass'

import { default as React, useRef, useState, useEffect } from 'react'

import { Observable, merge } from 'rxjs'


import { getTemplateSrv } from '@grafana/runtime'
import type { DataQuery } from '@grafana/schema'
import { DataSourcePlugin, DataSourceApi, MutableDataFrame, FieldType, LoadingState, CircularDataFrame,
    SelectableValue, type DataQueryRequest, type DataSourcePluginOptionsEditorProps,
    type DataSourceInstanceSettings, type DataQueryResponse, type QueryEditorProps,
    type DataSourceJsonData, type MetricFindValue, type FieldDTO
} from '@grafana/data'
import { InlineField, Input, InlineSwitch, Button, Icon, Select } from '@grafana/ui'


import { defer, delay } from 'xshell/utils.browser.js'


import {
    DDB, DdbType, DdbForm, type DdbObj, format, formati,
    datetime2ms, month2ms, minute2ms, date2ms, datehour2ms, second2ms, time2ms, timestamp2ms, nanotime2ns,
    nanotimestamp2ns, nulls, type DdbVectorValue, type DdbVectorObj, type DdbTableObj, type DdbOptions
} from 'dolphindb/browser.js'


import { t } from './i18n/index.js'

import { DdbCodeEditor } from './DdbCodeEditor.js'


export const fpd_root = '/public/plugins/dolphindb-datasource/' as const


console.log(t('DolphinDB Grafana 插件已加载'))



export class DataSource extends DataSourceApi<DdbDataQuery, DataSourceConfig> {
    settings: DataSourceInstanceSettings<DataSourceConfig>
    
    url: string
    
    options: DdbOptions
    
    ddb: DDB
    
    
    constructor (settings: DataSourceInstanceSettings<DataSourceConfig>) {
        super(settings)
        
        console.log('new DolphinDB.DataSource:', settings)
        
        this.settings = settings
        
        const { url, ...options } = settings.jsonData
        
        this.url = url
        this.options = options
        this.ddb = new DDB(url, options)
    }
    
    
    /** 调用后会确保和数据库的连接是正常的 (this.connected === true)，否则自动尝试建立新的连接  
        这个方法是幂等的，首次调用建立实际的 WebSocket 连接到 URL 对应的 DolphinDB，然后执行自动登录，  
        后续调用检查上面的条件 */
    async connect () {
        const { resource: websocket } = this.ddb.lwebsocket
        if (websocket && (websocket.readyState === WebSocket.CLOSING || websocket.readyState === WebSocket.CLOSED)) {
            console.log(t('检测到 ddb 连接已断开，尝试建立新的连接到:'), this.ddb.url)
            this.ddb = new DDB(this.url, this.options)
        }
        
        await this.ddb.connect()
    }
    
    
    override async testDatasource () {
        console.log('test datasource')
        
        try {
            await this.connect()
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
    
    
    override query (request: DataQueryRequest<DdbDataQuery>) {
        const { range: { from, to }, scopedVars } = request
        
        // 下面的 promises 是为了保证脚本类型下，所有 query 的数据都准备好后，
        // 再一起通过 subscriber.next 给 grafana，以解决不同时间添加数据导致图像线条闪烁的问题
        let pevals_ready = defer<void>()
        let pevals: Promise<DdbTableObj>[] = [ ]
        
        return merge(... request.targets.map(query => {
            const { refId, hide, is_streaming } = query
            const code = query.code || ''
            
            return new Observable<DataQueryResponse>(subscriber => {
                if (is_streaming) {
                    const { streaming: { table, action } } = query
                    
                    let frame = new CircularDataFrame({
                        append: 'head',
                        capacity: 10_0000
                    })
                    
                    if (!table) {
                        subscriber.error(t('table 不应该为空'))
                        return
                    }
                    
                    const { url, ...options } = this.settings.jsonData
                    
                    const sddb = new DDB(url, {
                        ...options,
                        streaming: {
                            table,
                            action,
                            handler: message => {
                                const { data, colnames } = message
                                const fields = this.convert(data, colnames)
                                
                                if (fields.length !== 0) {
                                    if (frame.fields.length === 0)
                                        for (const field of fields)
                                            frame.addField(field)
                                    
                                    const nrows = fields[0].values.length
                                    for (let i = 0;  i < nrows;  i++) {
                                        let row = { }
                                        for (const field of fields)
                                            row[field.name] = field.values[i]
                                        frame.add(row)
                                    }
                                    
                                    subscriber.next({
                                        data: [frame],
                                        key: query.refId,
                                        state: LoadingState.Streaming
                                    })
                                }
                            }
                        },
                    })
                    
                    ;(async () => {
                        try {
                            await sddb.connect()
                            
                            subscriber.next({
                                data: [frame],
                                key: refId,
                                state: LoadingState.Streaming
                            })
                        } catch (error) {
                            subscriber.error(error)
                        }
                    })()
                    
                    return () => {
                        sddb.disconnect()
                    }
                } else
                    if (hide || !code.trim())
                        subscriber.next({
                            data: [new MutableDataFrame({ refId, fields: [ ] })],
                            key: refId,
                            state: LoadingState.Done
                        })
                    else
                        (async () => {
                            try {
                                const tplsrv = getTemplateSrv()
                                    ;(from as any)._isUTC = false
                                    ;(to as any)._isUTC = false
                                
                                const code_ = tplsrv
                                    .replace(
                                        code
                                            .replaceAll(
                                                /\$(__)?timeFilter\b/g,
                                                () =>
                                                    'pair(' +
                                                        from.format('YYYY.MM.DD HH:mm:ss.SSS') +
                                                    ', ' +
                                                        to.format('YYYY.MM.DD HH:mm:ss.SSS') +
                                                    ')'
                                            ).replaceAll(
                                                /\$__interval\b/g,
                                                () =>
                                                    tplsrv.replace('$__interval', scopedVars).replace(/h$/, 'H')
                                            ),
                                        scopedVars,
                                        var_formatter
                                    )
                                
                                await this.connect()
                                
                                let peval = this.ddb.eval<DdbTableObj>(code_)
                                
                                pevals.push(peval)
                                if (pevals.length === request.targets.length)
                                    pevals_ready.resolve()
                                
                                const table = await peval
                                
                                if (table.form !== DdbForm.table)
                                    subscriber.error(t('Query 代码的最后一条语句需要返回 table，实际返回的是: {{value}}', { value: table.toString() }))
                                
                                await pevals_ready
                                await Promise.allSettled(pevals)
                                
                                subscriber.next({
                                    data: [
                                        new MutableDataFrame({
                                            refId,
                                            fields: this.convert(table)
                                        })
                                    ],
                                    key: refId,
                                    state: LoadingState.Done
                                })
                            } catch (error) {
                                subscriber.error(error)
                            }
                        })()
            })
        }))
    }
    
    
    override async metricFindQuery (query: string, options: any): Promise<MetricFindValue[]> {
        console.log('metricFindQuery:', { query, options })
        
        await this.connect()
        
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
                const value = format(DdbType.char, result.value, result.le, { nullstr: false, quote: false })
                return [{ text: value, value }]
            }
            
            case DdbForm.vector:
            case DdbForm.pair:
            case DdbForm.set: {
                let values = new Array(result.rows)
                
                for (let i = 0;  i < result.rows;  i++) {
                    const text = formati(result as DdbVectorObj, i, { quote: false, nullstr: false })
                    values[i] = { text, value: text }
                }
                
                return values
            }
            
            case DdbForm.table: {
                if ((result as DdbTableObj).value.length === 1) {
                    let values = new Array(result.value[0].rows)
                    
                    for (let i = 0;  i < result.value[0].rows;  i++) {
                        const text = formati(result.value[0], i, { quote: false, nullstr: false })
                        values[i] = {
                            text,
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
    
    
    convert (table: DdbObj<DdbObj<DdbVectorValue>[]>, colnames?: string[]): FieldDTO[] {
        return table.value.map((col, icol) => {
            const { type, value, rows, name = colnames[icol] } = col
            
            switch (type) {
                // --- boolean
                case DdbType.bool:
                    return {
                        name,
                        type: FieldType.boolean,
                        values: [...value as Uint8Array].map(x => x === nulls.int8 ? null : x)
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
                            
                            for (let i = 0;  i < rows;  i++)
                                values[i] = formati(col, i, { quote: false, nullstr: false })
                            
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
    }
}


/** DDB constructor 所需参数 */
interface DataSourceConfig extends DataSourceJsonData {
    url?: string
    autologin?: boolean
    username?: string
    password?: string
    python?: boolean
}

export interface DdbDataQuery extends DataQuery {
    is_streaming: boolean
    code?: string
    streaming?: {
        table: string
        action?: string
    }
}


function ConfigEditor ({
    options,
    onOptionsChange
}: DataSourcePluginOptionsEditorProps<DataSourceConfig>) {
    let { jsonData } = options
    
    jsonData.url ??= 'ws://127.0.0.1:8848'
    jsonData.autologin ??= true
    jsonData.username ??= 'admin'
    jsonData.password ??= '123456'
    jsonData.python ??= false
    
    
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
        
        <InlineField tooltip={t('(需要 v2.10.0 以上的 DolphinDB Server) 使用 Python Parser 来解释执行脚本, 默认 false')} label='Python' labelWidth={12}>
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
        
        <div className='version'>({t('插件构建时间:')} {BUILD_TIME})</div>
        
        {/* <div className='options'>
            { JSON.stringify(options) }
        </div> */}
    </div>
}


function QueryEditor (
    {
        query,
        onChange,
        onRunQuery,
        datasource
    }: QueryEditorProps<DataSource, DdbDataQuery, DataSourceJsonData> & { height?: number }
) {
    const script_type = { label: t('脚本'), value: 'script' as const }
    const streaming_type = { label: t('流数据表'), value: 'streaming' as const }
    
    const [type, set_type] = useState<SelectableValue<'script' | 'streaming'>>(script_type)
    
    useEffect(() => {
        set_type(query.is_streaming ? streaming_type : script_type)
    }, [ ])
    
    const {
        is_streaming,
        code,
        refId,
        streaming
    } = query
    
    return <div className='query-edtior-nav'>
        <div className='query-editor-nav-bar'>
            <InlineField tooltip={t('选择查询类型')} label={t('类型')} labelWidth={12}>
                <Select
                    placeholder='query'
                    options={[script_type, streaming_type]}
                    value={type}
                    width={20}
                    isMulti={false}
                    onChange={v => {
                        onChange({
                            refId: query.refId,
                            is_streaming: v.value === 'streaming',
                            code: query.code,
                            streaming: {
                                table: query.streaming?.table,
                            }
                        })
                        
                        set_type(v)
                    }}
                />
            </InlineField>
        </div>
        
        <div className={`query-editor-content ${type.value === 'script' ? '' : 'query-editor-content-none'}`}>
            <DdbCodeEditor
                query={query}
                onChange={onChange}
                onRunQuery={onRunQuery}
                datasource={datasource}
            />
        </div>
        
        <div className={`query-editor-content ${type.value === 'streaming' ? '' : 'query-editor-content-none'}`}>
            <div className='streaming-editor'>
                <div className='streaming-editor-content'>
                    <div className='streaming-editor-content-form'>
                        <InlineField tooltip={t('需要订阅的流数据表')} label={t('流数据表')} labelWidth={12}>
                            <Input
                                value={streaming?.table ?? ''}
                                onChange={event => {
                                    const { value } = event.currentTarget
                                    onChange({
                                        refId,
                                        is_streaming,
                                        code,
                                        streaming: {
                                            table: value || streaming?.table,
                                        }
                                    })
                                }} />
                        </InlineField>
                    </div>
                    <Button onClick={() => { onRunQuery() }}>{t('暂存')}</Button>
                </div>
            </div>
        </div>
    </div>
}


/** 创建 query 变量时的编辑器 */
function VariableEditor ({
    query,
    onChange,
}: {
    query: string
    onChange (query: string, definition: string): void
}) {
    const rquery = useRef(query)
    const rtrigger = useRef(() => { })
    
    function save () {
        const { current: query } = rquery
        console.log(t('暂存查询并更新预览:'))
        console.log(query)
        onChange(query, query)
        rtrigger.current()
    }
    
    return <div className='variable-query-editor'>
        <InlineField grow label='Query' labelWidth={20} tooltip={t('通过执行脚本生成变量选项，脚本的最后一条语句应返回标量、向量、或者只含一个向量的表格')}>
            <>
                {/* @ts-ignore */}
                <DdbCodeEditor
                    height={200}
                    query={{ code: query, refId: 'variable', is_streaming: false }}
                    onChange={({ code }) => {
                        rquery.current = code
                    }}
                    onRunQuery={save}
                    tip={false}
                />
                <VariableEditorBottom save={save} rtrigger={rtrigger} />
            </>
        </InlineField>
    </div>
}


function VariableEditorBottom ({
    save,
    rtrigger
}: {
    save? (): void
    rtrigger: React.MutableRefObject<() => void>
}) {
    const [visible, set_visible] = useState(false)
    
    rtrigger.current = async function trigger () {
        set_visible(true)
        await delay(500)
        set_visible(false)
    }
    
    return <div className='query-bottom'>
        <div className='note'>{t('修改 Query 后请在编辑框内按 Ctrl + S 或点击右侧按钮暂存查询并更新预览')}</div>
        <div className={`status ${visible ? 'visible' : ''}`}>
            <Icon className='icon' name='check-circle' />
            {t('已暂存查询并更新预览')}
        </div>
        <Button
            className='button'
            icon='save'
            onClick={event => {
                event.preventDefault()
                save()
            }
        }>{t('暂存查询并更新预览')}</Button>
    </div>
}


function var_formatter (value: string | string[], variable: any, default_formatter: Function) {
    if (typeof value === 'string')
        return value
    
    if (Array.isArray(variable))
        return JSON.stringify(variable)
    
    return default_formatter(value, 'json', variable)
}


// ------------ 注册插件
export const plugin = new DataSourcePlugin(DataSource)
    .setConfigEditor(ConfigEditor)
    .setQueryEditor(QueryEditor)
    .setVariableQueryEditor(VariableEditor)
