# DolphinDB DataSource
## 安装方法
### 1. 安装插件
解压 `dolphindb-datasource.2022.xx.xx.xx.zip`, 将其中的 dolphindb-datasource 文件夹解压到这个路径 `<grafana 安装目录>/data/plugins/dolphindb-datasource`

如果不存在 plugins 这一层目录，可以手动创建该文件夹

### 2. 修改 grafana 配置文件，使其允许加载未签名的 dolphindb-datasource 插件
阅读以下文档，创建 `custom.ini`
https://grafana.com/docs/grafana/latest/administration/configuration/#configuration-file-location

打开 `custom.ini` 文件，在 `[plugins]` 部分下面修改以下的配置
allow_loading_unsigned_plugins = dolphindb-datasource

### 3. 重启 Grafana 进程或服务
参考下面的文档
https://grafana.com/docs/grafana/latest/installation/restart-grafana/


### 4. 验证已加载插件
在 grafana 启动日志中可以看到类似以下的日志  
`WARN [05-19|12:05:48] Permitting unsigned plugin. This is not recommended logger=plugin.signature.validator pluginID=dolphindb-datasource pluginDir=<grafana 安装目录>/data/plugins/dolphindb-datasource`

或者直接访问下面的链接，能够看到页面中 DolphinDB 插件是 Installed 状态
http://localhost:3000/admin/plugins?filterBy=all&filterByType=all&q=dolphindb

## 使用方法
### 新建 DolphinDB 数据源
访问 http://localhost:3000/datasources 添加数据源，过滤搜索 dolphindb, 配置数据源后点 `Save & Test` 保存数据源

### 新建 Panel
在 Panel 的 Data source 属性中选择上一步添加的数据源，然后编写代码，代码的最后一条语句需要返回 table，编写完成后点击页面中的刷新按钮 (Refresh dashboard) 可以将代码发到 DolphinDB 数据库运行并展示出图表

## 开发
flink('d:/1/ddb/gfn/out/', 'e:/sdk/grafana/data/plugins/dolphindb-datasource/')
