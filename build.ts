#!/usr/bin/env node

import { fdelete } from 'xshell'

import { fpd_out, copy_files, webpack } from './webpack.js'


await fdelete(fpd_out)

await Promise.all([
    copy_files(),
    webpack.build()
])
