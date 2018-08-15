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
        var query = this.buildQueryParameters(options);
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
            console.log("res", res);
            for (var key in res.data.results) {
                var queryRes = res.data.results[key];
                console.log("queryRes", queryRes);
                if (queryRes.series) {
                    for (var i = 0; i < queryRes.series.length; i++) {
                        console.log("queryRes.series",queryRes.series[i]);
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
                    for (var table in queryRes.tables) {
                        table.format = 'table';
                        table.refId = queryRes.refId;
                        table.meta = queryRes.meta;
                        data.push(table);
                    }
                }
            }

            console.log("data", data);
            return {
                data: data
            };
        });
    }

    testDatasource() {
        return this.doRequest({
            url: this.url + '/',
            method: 'GET',
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
    interpolateVariable(value) {
        if (typeof value === 'string') {
            return '\'' + value + '\'';
        }

        var quotedValues = _.map(value, function (val) {
            return '\'' + val + '\'';
        });
        return quotedValues.join(',');
    }
    buildQueryParameters(options) {
        //remove placeholder targets
        //options.targets = _.filter(options.targets, target => {
        //  return target.target !== 'select metric';
        //});

        var targets = _.map(options.targets, target => {
            return {
                rawSql: this.templateSrv.replace(target.rawSql, options.scopedVars, 'regex'),
                //target: this.templateSrv.replace(target.rawSql, options.scopedVars, 'regex'),
                refId: target.refId,
                hide: target.hide,
                format: target.format || 'time_series'
            };
        });

        options.queries = targets;

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

}
