import { assert, flink, fmkdir } from 'xshell'

import { fpd_out } from './webpack.js'

await fmkdir(fpd_out)

const fpd_plugins = process.argv[2]
assert(fpd_plugins, 'pnpm run link 必须传入 grafana 插件目录的路径作为参数')

await flink(fpd_out, `${fpd_plugins.fpd}dolphindb-datasource/`)
