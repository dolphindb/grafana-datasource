#!/usr/bin/env node

import { webpack, copy_files } from './webpack.js'


await copy_files()

await webpack.start()
