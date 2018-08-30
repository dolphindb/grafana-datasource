### 背景

在物联网大数据领域,由于数据采集的频率非常高,采集点数非常多,会导致极大的实时数据流量，这种极高频的数据流除了对网络带宽造成压力之外，对系统集群的数据接收,处理能力也是极大的考验。

### 案例设计

为了验证DolphinDB系统对于高频流数据的处理能力，我们假设有这么一个场景: 在设备多个点安装了温度传感器，传感器每10ms采集并上传一次数据，用户需要实时监测过去1分钟每个温度传感器的平均温度，一旦温度超标能及时发现问题，以保障设备的良好运转。这里我们设计有1000个设备,每个设备上三个温度传感器以10ms的高频率采集并上传温度数据。

### 实施步骤

###### 1. 集群架设

我们首先要为上述的场景部署一个DolphinDB集群,这个集群要能够接收实时高频数据流,同时将高频数据流进行聚合运算,转化为低频数据流。
    单机多节点集群的部署参照: 
    https://github.com/dolphindb/Tutorials_CN/blob/master/single_machine_cluster_deploy.md

###### 2. 系统配置
本次架设的集群主要目标是需要接收流数据，并且将流数据发布供其他节点或客户端订阅消费。而我们的案例里消费主要集中在两个方面，一是对高频流数据进行实施运算，二是对高频数据进行数据备份，将实时数据订阅后保存到分布式文件系统中。所以我们系统需要进行如下配置。

cluster.node

* node1.subPort = 8089
* node2.subPort = 8089
* node3.subPort = 8089
* maxPubConnections = 64

controller.cfg

* enableDFS = 1
###### 3. 脚本
对于这样的场景，我们定义两张表用于存储高频和低频流数据。

高频表字段定义如下
字段名称 | 字段说明
---|---
hardwareId | 设备编号
ts | 采集时间(timestamp)
temp1 | 1号温度传感器数据
temp2 | 2号温度传感器数据
temp3 | 3号温度传感器数据

经过实时聚合计算之后，数据进入低频表，作为例子，我们仅简单的对一号传感器温度求前1分钟均值
低频表字段定义
字段名称 | 字段说明
---|---
time | 窗口最后一条记录时间(timestamp)
hardwareId | 设备编号
tempavg1 | 1号传感器均值

* 模拟数据生成
 
按照每10ms生成1000条的速度写入内存表，持续100秒，共计写入1000万条记录。
```
login("admin","123456")

n = 1000000;
tableSchema = streamTable(n:0,`hardwareId`ts`temp1`temp2`temp3,[INT,TIMESTAMP,DOUBLE,DOUBLE,DOUBLE])
share tableSchema as sensorInfoTable
enableTablePersistence(sensorInfoTable, true, false, 1000000)

def writeData(){
	hardwareNumber = 1000
	for (i in 0:10000) {
		data = table(take(1..hardwareNumber,hardwareNumber) as hardwareId ,take(now(),hardwareNumber) as ts,rand(20..41,hardwareNumber) as temp1,rand(30..71,hardwareNumber) as temp2,rand(70..151,hardwareNumber) as temp3)
		sensorInfoTable.append!(data)
		sleep(10)
	}
}
```

* 订阅高频数据并进行实时聚合运算
 
```
share streamTable(1000000:0, `time`hardwareId`tempavg1, [TIMESTAMP,INT,DOUBLE]) as aggregateResult
metrics = createStreamAggregator(60000,5000,<[avg(temp3)]>,sensorInfoTable,aggregateResult,`ts,`hardwareId,2000) 
subscribeTable(, "sensorInfoTable", "metric_engine", -1, append!{metrics},true)
```

* 订阅高频数据备份至分布式数据库中
```
if(exists("dfs://iotDemoDB")){
	dropDatabase("dfs://iotDemoDB")
}
db1 = database("",RANGE,0..10*100)
db2 = database("",VALUE,2018.08.14..2018.09.20) //请输入实际时间区间，
db = database("dfs://iotDemoDB",COMPO,[db1,db2])
dfsTable = db.createPartitionedTable(tableSchema,"sensorInfoTable",`hardwareId`ts)
subscribeTable(, "sensorInfoTable", "save_to_db", -1, append!{dfsTable}, true, 1000000,10)
```


* 启动数据写入Job
```
    submitJob("simulateData", "simulate sensor data", writeData)
```

###### 4. 前端展示配置

* 要观察实时的数据流，我们需要一个支持时序数据展示的前端平台，Grafana在这一方面是做的比较好的一个开源系统，DolphinDB实现了Grafana的数据对接，只要在Grafana系统里安装DolphinDB Datasource 插件即可以用Grafana来展示DolphinDB的流数据。
具体配置grafana 请参考 :   https://2xdb.net/dolphindb/grafana-datasource/blob/master/README.md

* 在执行submitJob之前，我们需要先配置好Grafana的接口，才能实时观察到实时运算的流数据

* 添加panel，定义datasource script
  在参照教程添加好数据源之后，就可以在graph panel里metrics tab页面上选择定义好的datasource,script输入框中输入
```
select gmtime(time) as time_sec,tempavg1 as sensor1 from outputX where hardwareId = 1
```
这段脚本是选出1号传感器的过去一分钟的平均温度,并且是根据时间推移实时计算。

* 保存panle，调整刷新频率，即可以观察到实时计算的数据。
* 我们可以在添加三个panle分别观察三个传感器的实时温度值

### 系统性能观测调整

* 如何观察高频数据流是否被及时的处理？
```
select * from getStreamingStat().subWorkers:
```
观察当前streaming的发布队列和消费队列的数据，用于判断数据的消费速度是否跟得上流入速度。
当流入数据积压并且没有下降的趋势，但是cpu资源还有余力时，可以适当缩短聚合计算的时间间隔，加快数据消费的速度。