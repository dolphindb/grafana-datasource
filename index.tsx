import './index.sass'

import { default as React, useRef, useState } from 'react'

import { delay } from 'xshell/utils.browser.js'

import { getDataSourceSrv } from '@grafana/runtime'
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
    QueryField,
    FormField,
    Button,
    Icon,
} from '@grafana/ui'


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


import { t } from './i18n/index.js'


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
            scopedVars,
            targets: queries,
        } = request
        
        
        const tplsrv = (getDataSourceSrv() as any).templateSrv
        
        
        return {
            data: await Promise.all(
                queries.map(async query => {
                    const { refId, hide } = query
                    
                    let { code } = query
                    
                    code ||= ''
                    
                    console.log(`${refId}.query:`, query)
                    
                    if (hide || !code.trim())
                        return new MutableDataFrame({ refId, fields: [ ] })
                    
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
                        
                    
                    console.log(`${refId}.code:`)
                    console.log(code_)
                    
                    
                    const table = await this.ddb.eval<DdbObj<DdbObj<DdbVectorValue>[]>>(code_)
                    
                    if (table.form !== DdbForm.table)
                        throw new Error(t('Query 代码的最后一条语句需要返回 table，实际返回的是: {{value}}', { value: table.toString() }))
                    
                    // return [
                    //     {
                    //         target: 'upper_75',
                    //         datapoints: [
                    //             [622, 1450754160000],
                    //             [365, 1450754220000]
                    //         ]
                    //     },
                    //     {
                    //         target: 'upper_90',
                    //         datapoints: [
                    //             [861, 1450754160000],
                    //             [767, 1450754220000]
                    //         ]
                    //     }
                    // ]
                    
                    const fields = table.value.map(col => {
                        const { type, value, rows, name } = col
                        
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
                    
                    const time_field = fields.find(field => 
                        field.type === FieldType.time)
                        
                    const value_field = 
                        fields.find(field => 
                            field.type === FieldType.number)
                        || fields.find(field => 
                            field.type !== FieldType.time)
                    
                    const rows = table.rows
                    
                    let datapoints: [number, number][] = new Array(rows)
                    
                    for (let i = 0;  i < rows;  i++)
                        datapoints[i] = [
                            value_field.values[i],
                            time_field.values[i]
                        ]
                    
                    return {
                        refId,
                        
                        datapoints
                    }
                })
            ),
        }
    }
    
    
    override async metricFindQuery (query: string, options: any): Promise<MetricFindValue[]> {
        console.log('metricFindQuery:', { query, options })
        
        const result = await this.ddb.eval(
            (getDataSourceSrv() as any).templateSrv
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
        <FormField 
            tooltip={t('数据库连接地址 (WebSocket URL), 如: ws://127.0.0.1:8848, wss://dolphindb.com (HTTPS 加密)')} 
            label='URL' 
            labelWidth={12}
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
        <br/>
 
        <FormField
            tooltip={t('是否在建立连接后自动登录，默认 true')}
            label={t('自动登录')}
            labelWidth={12}
            type='checkbox'
            checked={options.jsonData.autologin}
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
        <br/>
                
        {(options.jsonData.autologin || options.jsonData.autologin === undefined) && <>
            <FormField
                tooltip={t('DolphinDB 登录用户名')}
                label={t('用户名')}
                labelWidth={12}
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
            
            <FormField
                tooltip={t('DolphinDB 登录密码')}
                label={t('密码')}
                labelWidth={12}
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
            <br />
        </>}
        
        <FormField
            tooltip={t('使用 Python Parser 来解释执行脚本, 默认 false')}
            label='Python'
            type='checkbox'
            labelWidth={12}
            checked={options.jsonData.python}
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
        
        {/* <div className='options'>
            { JSON.stringify(options) }
        </div> */}
    </div>
}


function QueryEditor (
    {
        query: {
            code,
            refId
        },
        onChange,
    }: QueryEditorProps<DataSource, DdbDataQuery, DataSourceJsonData> & { height?: number }
) {
    const [query, set_query] = useState(
        code.replaceAll('\r\n', '\n')
    )
    
    return <div className='query-editor'>
        <QueryField
            query={query}
            portalOrigin=''
            onBlur={() => {
                onChange({
                    refId,
                    code: query.replaceAll('\r\n', '\n')
                })
            }}
            onChange={(query) => {
                set_query(
                    query.replaceAll('\r\n', '\n')
                )
            }}
        />
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
    const rtrigger = useRef(() => { })
    
    function save () {
        const { current: query } = rquery
        console.log('save query:')
        console.log(query)
        onChange(query, query)
        rtrigger.current()
    }
    
    return <div className='variable-query-editor'>
            <>
                Query: {t('通过执行脚本生成变量选项，脚本的最后一条语句应返回标量、向量、或者只含一个向量的表格')}
                {/* @ts-ignore */}
                <QueryEditor
                    query={{ code: query, refId: 'variable' }}
                    onChange={({ code }) => {
                        rquery.current = code
                    }}
                    onRunQuery={save}
                />
                <VariableQueryEditorBottom save={save} rtrigger={rtrigger} />
            </>
    </div>
}

function VariableQueryEditorBottom ({
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
            onClick={e => {
                e.preventDefault()
                save()
            }
        }>{t('暂存查询并更新预览')}</Button>
    </div>
}


export const plugin = new DataSourcePlugin(DataSource)
    .setConfigEditor(ConfigEditor)
    .setQueryEditor(QueryEditor)
    .setVariableQueryEditor(VariableQueryEditor)
