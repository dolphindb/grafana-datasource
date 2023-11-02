# DolphinDB Grafana DataSource Plugin

<p align='center'>
    <img src='./ddb.svg' alt='DolphinDB Grafana DataSource' width='256'>
</p>

<p align='center'>
    <a href='https://github.com/dolphindb/api-javascript' target='_blank'>
        <img alt='vscode extension installs' src='https://img.shields.io/npm/v/dolphindb?color=brightgreen&label=api-javascript&style=flat-square' />
    </a>
</p>

## English | [中文](./README.zh.md)

Grafana is an open source data visualization web application that is good at dynamically displaying time series data and supports multiple data sources. Users can display data graphs in the browser through Grafana by configuring the connected data source and writing query scripts

DolphindB has developed Grafana data source plug-in (DolphindB-Datasource), allowing users to interact with DolphinDB by writing query scripts and  subscribing streaming data tables on the Grafana panel.

<img src='./demo.png' width='1200'>

## Installation
#### 1. Install Grafana
Go to Grafana official website: https://grafana.com/oss/grafana/ , install the latest open source version (OSS, Open-Source Software)

#### 2. Install the dolphindb-datasource plugin
In Releases (https://github.com/dolphindb/grafana-datasource/releases) download the latest version of the plugin zip, such as `dolphindb-datasource.v2.0.900.zip`

Unzip the dolphindb-datasource folder in the compressed package to the plugin directory of grafana:
- Windows: `<grafana installation directory>/data/plugins/`
- Linux:
     - grafana is obtained by decompressing the zip archive: `<grafana installation directory>/data/plugins/`
     - grafana is installed via the package manager: `/var/lib/grafana/plugins/`

If the plugins level directory does not exist, you can manually create this folder

#### 3. Modify the Grafana configuration file so that it allows to load the unsigned dolphindb-datasource plugin
Read the following documents to open and edit configuration files
https://grafana.com/docs/grafana/latest/administration/configuration/#configuration-file-location

Uncomment `allow_loading_unsigned_plugins` under the `[plugins]` section and configure it as `dolphindb-datasource`, i.e. put the following
```ini
# Enter a comma-separated list of plugin identifiers to identify plugins to load even if they are unsigned. Plugins with modified signatures are never loaded.
;allow_loading_unsigned_plugins =
```
changed to
```ini
# Enter a comma-separated list of plugin identifiers to identify plugins to load even if they are unsigned. Plugins with modified signatures are never loaded.
allow_loading_unsigned_plugins = dolphindb-datasource
```

Note: Grafana needs to be restarted every time a configuration item is modified

### 4. Restart the Grafana process or service
Open Task Manager > Services > Find Grafana Service > Right Click Restart

https://grafana.com/docs/grafana/latest/installation/restart-grafana/


### Verify that the plugin is loaded
You can see a log similar to the following in the grafana startup log
````log
WARN [05-19|12:05:48] Permitting unsigned plugin. This is not recommended logger=plugin.signature.validator pluginID=dolphindb-datasource pluginDir=<grafana installation directory>/data/plugins/dolphindb-datasource
````

The log file path might be:
- Windows: `<grafana installation directory>/data/log/grafana.log`
- Linux: `/var/log/grafana/grafana.log`

Or visit the link below, you can see that the DolphinDB plugin on the page is in the Installed state
http://localhost:3000/admin/plugins?filterBy=all&filterByType=all&q=dolphindb



## Instructions
### 1. Open and log in to Grafana
Open http://localhost:3000
The initial login name and password are both admin

### 2. Create a new DolphinDB data source
Open http://localhost:3000/datasources or click `Configuration > Data sources` in the left navigation to add a data source, filter and search for dolphindb, configure the data source and click `Save & Test` to save the data source

Note: The new version of the plugin uses the WebSocket protocol to communicate with the DolphinDB database. The URL needs to start with `ws://` or `wss://` in the database configuration. Users upgrading from the old version of the plugin need to change the database URL from `http://` ` or `https://` to `ws://` or `wss://`

### 3. Create a new Panel, writing query scripts or subscribing streaming data tables to visualize DolphinDB's time-series data
Open or create new Dashboard, edit or create a new Panel, select the data source added to the Panel's data source attribute
#### 3.1. Write the script to execute the query to visulize the time-series table returned
1. Set the query type to `script`  
2. Write a query script, the last statement of the code needs to return a table  
3. After writing, press `Ctrl + S` to save, or click the refresh button on the page (Refresh dashboard), you can send the Query to the DolphinDB database to run and display the chart  
4. The height of the code editing box can be adjusted by dragging the bottom  
5. Click to save the `Save` button in the upper right corner to save the Panel configuration

The dolphindb-datasource plugin supports variables, such as:
- `$__timeFilter` variable: the value is the time axis interval above the panel. For example, the current time axis interval is `2022-02-15 00:00:00 - 2022.02.17 00:00:00` , then the ` $__timeFilter` will be replaced with `pair(2022.02.15 00:00:00.000, 2022.02.17 00:00:00.000)`
- `$__interval` and `$__interval_ms` variables: the value is the time grouping interval automatically calculated by grafana based on the length of the time axis interval and the screen pixels. `$__interval` will be replaced with the corresponding duration type in DolphinDB; `$__interval_ms` will be replaced with the number of milliseconds (integer)
- query variable: Generate dynamic value or list of options via SQL query

For more variables see https://grafana.com/docs/grafana/latest/variables/


To view the message output by `print('xxx')` in the code, or the code after variable substitution (interpolation), you can press `F12` or `Ctrl + Shift + I` or `Right click > Inspect` to open the browser development Or debug tools (devtools), switch to the console (Console) panel to view

#### 3.2. Subscribe to and visualize the streaming data table in DolphinDB
Requirements: DolphinDB Server version is not less than 2.00.9 or 1.30.21  
1. Set the query type to `streaming`  
2. Fill in the streaming data table name to be subscribed to  
3. Click the `Temporarily Store` button  
4. Change the time range to `Last 5 Minutes` (need to include the current time, such as Last x Hour/Minutes/Seconds instead of the historical time interval, otherwise you will not see the data)
5. Click to save the `Save` button in the upper right corner to save the Panel configuration

### 4. Learn how to use Grafana by referring to the documentation
https://grafana.com/docs/grafana/latest/


### FAQ
Q: How to set the automatic refresh interval of the dashboard?
A:
For the type of script, open Dashboard, and refresh the right side to the right side of the right corner to click the drop -down box to select the automatic refresh interval  
For stream data table types, the data is real-time, no settings are required. When no new data is updated, the connection will be closed; otherwise, the connection will be re-established.

If you need to customize the refresh interval, you can open `dashboard settings > Time options > Auto refresh`, enter a custom interval  

If you need a refresh interval smaller than 5s, such as 1s, you need to do the following:
Modify the grafana configuration file
````ini
[dashboards]
min_refresh_interval = 1s
````
Restart grafana after modification
(Reference: https://community.grafana.com/t/how-to-change-refresh-rate-from-5s-to-1s/39008/2)


## Build and development
```shell
# Install the latest version of nodejs
# https://nodejs.org/en/download/current/

# Install the pnpm package manager
corepack enable
corepack prepare pnpm@latest --activate

git clone https://github.com/dolphindb/grafana-datasource.git

cd grafana-datasource

# Install project dependencies
pnpm install

# Copy .vscode/settings.template.json to .vscode/settings.json
cp .vscode/settings.template.json .vscode/settings.json

# Refer to scripts in package.json

# Link the output folder after the project is built to the plug-in directory of grafana (just link it once after cloning the project)
# The parameter passed in is the plugin directory of the installed grafana
# - Windows: `<grafana installation directory>/data/plugins/`
# - Linux: `/var/lib/grafana/plugins/`
pnpm run link E:/sdk/grafana/data/plugins/

# development
pnpm run dev

# restart grafana

# scan entries
pnpm run scan
# Manually complete untranslated entries
# Run the scan again to update the dictionary file dict.json
pnpm run scan

#lint
pnpm run lint

#lint fix
pnpm run fix

# Construct
npm run build
# After completion, the product is in the out folder. Rename out to dolphindb-datasource and compress it to .zip
```
