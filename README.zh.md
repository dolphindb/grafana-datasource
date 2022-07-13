# DolphinDB Grafana DataSource Plugin

<p align='center'>
    <img src='./ddb.svg' alt='DolphinDB Grafana DataSource' width='256'>
</p>

<p align='center'>
    <a href='https://github.com/dolphindb/api-javascript' target='_blank'>
        <img alt='vscode extension installs' src='https://img.shields.io/npm/v/dolphindb?color=brightgreen&label=api-javascript&style=flat-square' />
    </a>
</p>

## [English](./README.md) | 中文

Grafana 是一个开源的数据可视化 Web 应用程序，擅长动态展示时序数据，支持多种数据源。用户通过配置连接的数据源，以及编写查询脚本，可在浏览器里显示数据图表

DolphinDB 开发了 Grafana 数据源插件 (dolphindb-datasource)，让用户在 Grafana 面板 (dashboard) 上通过编写查询脚本，与 DolphinDB 进行交互 (基于 WebSocket)，实现  DolphinDB 时序数据的可视化

<img src='./demo.png' width='1200'>

## 安装方法
### 1. 安装 Grafana
前往 Grafana 官网: https://grafana.com/oss/grafana/ 下载并安装最新的开源版本 (OSS, Open-Source Software)

### 2. 安装 dolphindb-datasource 插件
在 [releases](https://github.com/dolphindb/grafana-datasource/releases) 中下载最新版本的插件压缩包，如 `dolphindb-datasource.xxxx.xx.xx.xx.zip`

将压缩包中的 dolphindb-datasource 文件夹解压到以下路径:
- Windows: `<grafana 安装目录>/data/plugins/`
- Linux: `/var/lib/grafana/plugins/`

如果不存在 plugins 这一层目录，可以手动创建该文件夹

### 3. 修改 grafana 配置文件，使其允许加载未签名的 dolphindb-datasource 插件
阅读 https://grafana.com/docs/grafana/latest/administration/configuration/#configuration-file-location  
打开并编辑配置文件： 

在 `[plugins]` 部分下面取消注释 `allow_loading_unsigned_plugins`，并配置为 `dolphindb-datasource`
```ini
allow_loading_unsigned_plugins = dolphindb-datasource
```

注：每次修改配置项后，需重启 Grafana

### 4. 重启 Grafana 进程或服务
打开任务管理器 > 服务 > 找到 Grafana 服务 > 右键重启

https://grafana.com/docs/grafana/latest/installation/restart-grafana/


### 5. 验证已加载插件
在 grafana 启动日志中可以看到类似以下的日志  
```log
WARN [05-19|12:05:48] Permitting unsigned plugin. This is not recommended logger=plugin.signature.validator pluginID=dolphindb-datasource pluginDir=<grafana 安装目录>/data/plugins/dolphindb-datasource
```

日志文件路径：
- Windows: `<grafana 安装目录>/data/log/grafana.log`
- Linux: `/var/log/grafana/grafana.log`

或者访问下面的链接，看到页面中 DolphinDB 插件是 Installed 状态：  
http://localhost:3000/admin/plugins?filterBy=all&filterByType=all&q=dolphindb



## 使用方法
### 1. 打开并登录 Grafana
打开 http://localhost:3000  
初始登入名以及密码均为 admin

### 2. 新建 DolphinDB 数据源
打开 http://localhost:3000/datasources ，或点击左侧导航的 `Configuration > Data sources` 添加数据源，搜索并选择 dolphindb，配置数据源后点 `Save & Test` 保存数据源

注: 2022 年及之后的插件使用 WebSocket 协议与 DolphinDB 数据库通信，因此数据源配置中的 URL 需要以 `ws://` 或者 `wss://` 开头

### 3. 新建 Panel，编写查询脚本，可视化 DolphinDB 时序数据
打开或新建 Dashboard，编辑或新建 Panel，在 Panel 的 Data source 属性中选择上一步添加的数据源  
编写查询脚本，代码的最后一条语句需要返回 table  
编写完成后按 `ctrl + s` 保存，或者点击页面中的刷新按钮 (Refresh dashboard)，可以将 Query 发到 DolphinDB 数据库运行并展示出图表  
代码编辑框的高度通过拖动底部边框进行调整

dolphindb-datasource 插件支持变量，比如:
- `$__timeFilter` 变量: 值为面板上方的时间轴区间，比如当前的时间轴区间是 `2022-02-15 00:00:00 - 2022.02.17 00:00:00` ，那么代码中的 `$__timeFilter` 会被替换为 `pair(2022.02.15 00:00:00.000, 2022.02.17 00:00:00.000)`
- `$__interval` 和 `$__interval_ms` 变量: 值为 grafana 根据时间轴区间长度和屏幕像素点自动计算的时间分组间隔。`$__interval` 会被替换为 DolphinDB 中对应的 DURATION 类型; `$__interval_ms` 会被替换为毫秒数 (整型)
- query 变量: 通过 SQL 查询生成动态值或选项列表

更多变量请查看 https://grafana.com/docs/grafana/latest/variables/


要查看代码中 `print('xxx')` 输出的消息，或者变量替换 (插值) 后的代码，可以按 `F12` 或 `Ctrl + Shift + I` 或 `右键 > 检查` 打开浏览器的开发者调试工具 (devtools), 切换到控制台 (Console) 面板中查看

### 4. 参考文档学习 Grafana 使用
https://grafana.com/docs/grafana/latest/

### FAQ
Q: 如何设置 dashboard 自动刷新间隔？  
A:   
打开 dashboard, 在右上角刷新按钮右侧点击下拉框选择自动刷新间隔。

如果需要自定义刷新间隔，可以打开 `dashboard settings > Time options > Auto refresh`, 输入自定义的间隔
如果需要定义比 5s 更小的刷新间隔，比如 1s，需要按下面的方法操作:  
修改 grafana 配置文件
```ini
[dashboards]
min_refresh_interval = 1s
```
修改完后重启 grafana  
(参考: https://community.grafana.com/t/how-to-change-refresh-rate-from-5s-to-1s/39008/2)


## 构建及开发方法
```shell
git clone https://github.com/dolphindb/grafana-datasource.git

cd grafana-datasource

npm i --force

# 1. 构建插件
npm run build
# 完成后产物在 out 文件夹中。将 out 重命名为 dolphindb-datasource 后压缩为 .zip 即可


# 2. 开发插件
npm run dev
# 将 out 文件夹软链接到 grafana plugins 目录下
flink('d:/grafana-datasource/out/', 'e:/sdk/grafana/data/plugins/dolphindb-datasource/')

# 重启 grafana
```
