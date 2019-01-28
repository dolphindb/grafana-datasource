# DolphinDB API for Grafana

Grafana is an open source web-based data visualization tool that excels at dynamic display of time series data. It supports multiple data sources through plug-ins. To support the use of Grafana to display time-series data from DolphinDB in real time, DolphinDB provides dolphindb-datasource plugin and implements the HTTP data interface to Grafana. 

### 1. Install DolphinDB (v0.8 and above)

https://github.com/dolphindb/Tutorials_EN/blob/master/README.md

### 2. Install Grafana

http://docs.grafana.org/installation/

### 3. Install grafana-dolphindb-datasource

Before installing the data source plugin, please download the plugin source archive from http://www.github.com/dolphindb/grafana-datasource. Extract the plugin source to a directory under "grafanax.xx/data/plugins/", rename the directory as "dolphindb-datasource", restart Grafana, the new plugin will be loaded automatically.

Next, please choose the dolphindb-datasource plugin on the Grafana settings interface, then login into the system. 

 ![image](img/1.PNG)

Use the following steps to set up DolphinDB data source:

1. Enter "Add data source" in the interface (see image below)
    * Name: you pick any name for the data source
    * Type: choose DolphinDB from the drop-down menu
    * URL: DolphinDB server URL. If DolphinDB is installed on the same machine and the port number is 8848，then URL is：```http://localhost:8848/grafana```
2. All other options use default settings
3. Click on "Save & Test" and wait for a green prompt showing "Success"

![image](img/2.PNG)
   

### 4. Example

We use a simple example to show how to display real-time data from a DolphinDB table in Grafana.

#### 4.1 Create a DolphinDB data source

The following script creates an in-memory table "temperatureTable" on the DolphinDB server, and writes data to the table every second for 200 seconds.
```
n=100000
t1=streamTable(n:0, `temperature`ts,[DOUBLE,TIMESTAMP])
share t1 as temperatureTable
t1=NULL
def writeData(){
	for (i in 0:200) {
		data = table(rand(35..50,1) as temperature, now() as ts)
		temperatureTable.append!(data)
		sleep(1000)
	}
}
submitJob("jobId","writeDataToStreamingTable",writeData)
```

#### 4.2 Graph panel query

Create a Graph type panel in Grafana Dashboard, click "edit" to enter the panel editing interface on the panel header drop-down menu, switch to the "metrics" tab and select the aforementioned DolphinDB data source, add the following query:
```
select gmtime(ts) as time_sec,temperature as serie1 from temperatureTable where ts> now()-5*60*1000
```

Save the panel, go back to the dashboard, set the timed refresh and the length of the data period in the upper right corner, you can see the real-time temperature change chart.

For more information about Grafana, please refer to [Grafana official tutorial](http://docs.grafana.org/guides/getting_started/)


### 5. About temporal data

#### 5.1 UTC time zone conversion

Since the default timezone of Grafana dashboards is UTC, Grafana assumes all input temporal data are UTC time. You should convert temporal data from your local time zone to UTC with DolphinDB function `gmtime` before using Grafana. 

Generate UTC time in DolphinDB:
```
select gmtime(ts) as time_sec, temperature as serie1 from temperatureTable
```
#### 5.2 Fetch data based on moving time interval

Grafana fetches data periodically in moving windows to display streaming data.
 ![image](img/4.PNG)

DolphinDB provides several ways to capture data in moving windows.

Fetch data in the past 5 minutes:

```
select gmtime(time_field), price as series1 from [table_name] where time_field>now()-5*60*1000
```

Fetch data in moving windows set in Grafana:

```
select gmtime(time_field), price as series1 from [table_name] where time_field between $__timeFilter
```

Here the macro variable `$__timeFilter` represents the interval value set in Grafana.