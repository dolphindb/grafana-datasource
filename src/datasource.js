import _ from "lodash";

export class GenericDatasource {

    constructor(instanceSettings, $q, backendSrv, templateSrv) {
        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.name = instanceSettings.name;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.withCredentials = instanceSettings.withCredentials;
        this.headers = { 'Content-Type': 'application/json' };
        if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
            this.headers['Authorization'] = instanceSettings.basicAuth;
        }
    }

    query(options) {
        var query = this.buildQueryParameters(options, this.templateSrv);
        query.targets = query.targets.filter(t => !t.hide);

        if (query.targets.length <= 0) {
            return this.q.when({ data: [] });
        }

        if (this.templateSrv.getAdhocFilters) {
            query.adhocFilters = this.templateSrv.getAdhocFilters(this.name);
        } else {
            query.adhocFilters = [];
        }

        return this.doRequest({
            url: this.url,
            data: query,
            method: 'POST'
        }).then(res => {
            var data = [];

            if (!res.data.results) {
                return {
                    data: data
                };
            }

            for (var key in res.data.results) {
                var queryRes = res.data.results[key];
                if (queryRes.series) {
                    for (var i = 0; i < queryRes.series.length; i++) {
                        var series = queryRes.series[i];
                        data.push({
                            target: series.name,
                            datapoints: series.points,
                            refId: queryRes.refId,
                            meta: queryRes.meta,
                        });
                    }
                }

                if (queryRes.tables) {
                    for (var i = 0;i < queryRes.tables.length; i++) {
                        var table = queryRes.tables[i];
                        table.format = 'table';
                        table.refId = queryRes.refId;
                        table.meta = queryRes.meta;
                        data.push(table);
                    }
                }
            }

            return {
                data: data
            };
        });
    }

    testDatasource() {
        return this.doRequest({
            url: this.url,
            method: 'POST',
        }).then(response => {
            if (response.status === 200) {
                return { status: "success", message: "Data source is working", title: "Success" };
            }
        });
    }

    annotationQuery(options) {
        var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
        var annotationQuery = {
            range: options.range,
            annotation: {
                name: options.annotation.name,
                datasource: options.annotation.datasource,
                enable: options.annotation.enable,
                iconColor: options.annotation.iconColor,
                query: query
            },
            rangeRaw: options.rangeRaw
        };

        return this.doRequest({
            url: this.url + '/annotations',
            method: 'POST',
            data: annotationQuery
        }).then(result => {
            return result.data;
        });
    }

    metricFindQuery(query) {
        var interpolated = {
            target: this.templateSrv.replace(query, null, 'regex')
        };

        return this.doRequest({
            url: this.url + '/search',
            data: interpolated,
            method: 'POST',
        }).then(this.mapToTextValue);
    }

    mapToTextValue(result) {
        return _.map(result.data, (d, i) => {
            if (d && d.text && d.value) {
                return { text: d.text, value: d.value };
            } else if (_.isObject(d)) {
                return { text: d, value: i };
            }
            return { text: d, value: d };
        });
    }

    doRequest(options) {
        options.withCredentials = this.withCredentials;
        options.headers = this.headers;

        return this.backendSrv.datasourceRequest(options);
    }
   
    buildQueryParameters(options, templateSrv) {
        
        var targets = _.map(options.targets, target => {
            var sql = target.rawSql;
            sql = sql.replace("$__timeFilter_UTC", "pair(" + this.format(options.range.from,true) + "," + this.format(options.range.to,true) + ")");
            sql = sql.replace("$__timeFilter", "pair(" + this.format(options.range.from,false) + "," + this.format(options.range.to,false) + ")");
            //support variables
            sql = templateSrv.replace(sql, options.scopedVars);
            return {
                rawSql: sql,
                refId: target.refId,
                hide: target.hide,
                format: target.format || 'time_series'
            };
        });

        options.queries = targets;
        options.targets = targets;
        return options;
    }

    getTagKeys(options) {
        return new Promise((resolve, reject) => {
            this.doRequest({
                url: this.url + '/tag-keys',
                method: 'POST',
                data: options
            }).then(result => {
                return resolve(result.data);
            });
        });
    }

    getTagValues(options) {
        return new Promise((resolve, reject) => {
            this.doRequest({
                url: this.url + '/tag-values',
                method: 'POST',
                data: options
            }).then(result => {
                return resolve(result.data);
            });
        });
    }

    format(d, isUTC) {
        d._isUTC = isUTC;
        return d.year() + "." + this.PrefixInteger(d.month() + 1,2) + "." + this.PrefixInteger(d.date(),2) + "T" + this.PrefixInteger(d.hour(),2) + ":" + this.PrefixInteger(d.minute(),2) + ":" + this.PrefixInteger(d.second(),2) + "." + this.PrefixInteger(d.millisecond(),3);
    }

    PrefixInteger(num, length) {  
        return (Array(length).join('0') + num).slice(-length);  
    }
}
