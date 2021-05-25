Grafana是一个开源的基于web的数据展示工具，擅长动态展示时序数据。它内部支持多种数据源，也支持以插件方式对数据源进行扩展。DolphinDB为了支持使用Grafana来实时展示时序数据，提供了Grafana的dolphindb-datasource插件，并且实现了对Grafana的HTTP数据接口，可以通过类SQL的查询脚本将DolphinDB的数据表以直观的方式展示在Grafana的Dashboard上。

### 1 安装DolphinDB

参考以下文档：

* 中文版 ：https://github.com/dolphindb/Tutorials_CN/blob/master/README.md
* 英文版 ：https://github.com/dolphindb/Tutorials_EN/blob/master/README.md

### 2 安装并启动Grafana

参考文档
http://docs.grafana.org/installation/

### 3 安装 grafana-dolphindb-datasource
首先从 http://www.github.com/dolphindb/grafana-datasource 下载插件源码压缩包，将插件源码解压到"grafanax.xx/data/plugins/"目录之下，然后把该子目录重命名为"dolphindb-datasource"。修改后目录如下(以windows下安装为例)：
```
D:\Program Files\GrafanaLabs\grafana\data\plugins>tree
D:.
└─dolphindb-datasource
    ├─.vs
    │  ├─config
    │  └─dolphindb-datasource
    │      └─v15
    ├─dist
    │  ├─css
    │  ├─img
    │  └─partials
    ├─img
    ├─spec
    └─src
        ├─css
        ├─img
        └─partials
```

源码放好后，需要重启一下Grafana服务。譬如在Win10上，可以打开windows任务管理器，在如下图所示服务页，找到Grafana服务后右键点击并选择重启启动。

![restartGrafana](img/restartGrafana.PNG?raw=true)

配置dolphindb-datasource插件以设置数据源，如下图所示，先登录系统，然后点击图中的红色大圈所在位置"Add your first data source"或红色小圈所在位置"Configuration/Data sources"，进入后再点击"Add data source":

![datasource1](img/ds1.png?raw=true)

在下图所示界面中选择DolphinDB：

![datasource1](img/ds2.png?raw=true)

进入"Add data source"界面，设置url为DolphinDB节点IP以及端口号，其他默认，然后点击"Save & Test"，出现绿色的提示成功，如下图所示：

![datasource1](img/grafanaAddDS.PNG?raw=true)

### 4 实例

我们通过一个简单例子来说明如何在Grafana里实时展示DolphinDB的数据。

#### 4.1 创建 DolphinDB 数据源 

在DolphinDB中创建一个内存表"temperatureTable"，每秒钟向表里写入温度数据，持续200秒。

```
n=100000
t1=streamTable(n:0, `temperature`ts,[DOUBLE,TIMESTAMP])
//需要share成共享表,否则grafana无法直接访问
share t1 as temperatureTable
t1=NULL
def writeData(){
	for (i in 0:200) {
		data = table(rand(35..50,1) as temperature,now() as ts)
		temperatureTable.append!(data)
		sleep(1000)
	}
}
submitJob("jobId","writeDataToStreamingTable",writeData)
```

#### 4.2 设计Grafana的图形面板及数据查询语句

首先在Grafana的Home界面点击"Create Dashboard"，然后点击"Add new panel"，在如下图所示界面的 Query options 中选择DolphinDB数据源后，数据源下方会出现一个用于输入脚本的文本输入框，输入以下查询语句以读取前5分钟的数据。
```

select gmtime(ts) as time_sec, temperature as serie1 from temperatureTable where ts>now()-5*60*1000
```
在右上角设置定时刷新及数据时间段的长度，就可以看到实时的温度变化走势图。
![datasource1](img/newDashboard.png?raw=true)

注意，若是查询分布式表，需要在SQL语句中先login。例如：
```
login('admin', '123456'); select gmtime(timestamp(datetime)) as time_sec, tag1  from loadTable('dfs://iot', 'equip') where equipNo=1 and datetime> now().datetime()-5*60
```

具体Grafana操作，可以参考[Grafana官方教程](http://docs.grafana.org/guides/getting_started/)


### 5 关于时间数据处理的注意事项

- 标准UTC时间的转换

由于Grafana对于输入的时间数据都会当做UTC标准时间来处理，所以如果我们数据源的时间数据不是UTC标准时间的话，进入到Grafana就会发生识别误差。如果Grafana server安装在美国西五区的服务器上，DolphinDB在西八区服务器上，DolphinDB保存了一个时间数据```09:30:01```，对应的西五区时间是```12:30:01```，Grafana server如果在未作转换的情况下取到这个数据之后，会默认认为这是UTC时间，然后会对这个数据做本地化时区转换，即```09:30:01-5小时=04:30:01```，所以只有先把西八区的```09:30:01```转换成对应的UTC时间```17:30:01```，Grafana才能正确处理并显示正确的时间。

在DolphinDB中产生UTC时间：
```
select gmtime(ts) as time_sec,temperature as serie1 from temperatureTable
```

 - 根据移动时间区间抓取数据

Grafana采用指定移动时间区间，定时抓取数据的方式以显示流数据。可在Grafana系统中设置抓取数据的时间区间及频率，如图：

 ![image](img/4.PNG)

DolphinDB提供了几种抓取移动的时间区间内的数据的方式。

取过去5分钟内数据：
```
select gmtime(time_field),price as series1 from [table_name] where time_field > now()-5*60*1000
```

根据在Grafana中设置的时间段来过滤数据(这个时间段Grafana会根据浏览器时间自行推移)：
```
select gmtime(time_field),price as series1 from [table_name] where time_field between $__timeFilter
```

插件支持宏变量`$__timeFilter`，代表Grafana系统中设置的时间区间值。比如当前grafana中的时间轴区间是 `2018.12.18T11:14:01 - 2018.12.18T11:19:01` ，那么`$__timeFilter`在提交到DolphinDB里执行时，会被替换为`pair(2018.12.18T11:14:01,2018.12.18T11:19:01)`
若在grafana中设置了使用UTC时间，那么请使用对应的宏变量`$__timeFilter_UTC`
