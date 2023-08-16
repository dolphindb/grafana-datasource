#!/usr/bin/env node

import { fmkdir, Remote, type RemoteReconnectingOptions } from 'xshell'

import { fpd_out, copy_files, webpack, ramdisk } from './webpack.js'

await fmkdir(fpd_out)

await Promise.all([
    copy_files(),
    webpack.run(false)
])


let remote: Remote

// 监听终端快捷键
// https://stackoverflow.com/a/12506613/7609214

let { stdin } = process

stdin.setRawMode(true)

stdin.resume()

stdin.setEncoding('utf-8')

// on any data into stdin
stdin.on('data', async function (key: any) {
    // ctrl-c ( end of text )
    if (key === '\u0003')
        process.exit()
    
    // write the key to stdout all normal like
    console.log(key)
    
    switch (key) {
        case 'r':
            await webpack.run(false)
            break
            
        case 'x':
            remote?.disconnect()
            await webpack.close()
            process.exit()
            break
    }
})


if (ramdisk) {
    const reconnecting_options: RemoteReconnectingOptions = {
        func: 'register_ddb_gfn',
        on_error (error: Error) {
            console.log(error.message)
        }
    }
    
    remote = new Remote({
        url: 'ws://localhost',
        
        funcs: {
            async recompile () {
                await webpack.run(false)
                return [ ]
            },
            
            async exit () {
                remote.disconnect()
                await webpack.close()
                process.exit()
            }
        },
        
        on_error (error) {
            console.log(error.message)
            remote.start_reconnecting({ ...reconnecting_options, first_delay: 1000 })
        }
    })
    
    remote.start_reconnecting(reconnecting_options)
}


console.log(
    '编译器已启动，快捷键:\n' +
    'r: 重新编译\n' +
    'x: 退出编译器'
)

