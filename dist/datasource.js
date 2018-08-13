'use strict';

System.register(['lodash'], function (_export, _context) {
    "use strict";

    var _, _createClass, GenericDatasource;

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    return {
        setters: [function (_lodash) {
            _ = _lodash.default;
        }],
        execute: function () {
            _createClass = function () {
                function defineProperties(target, props) {
                    for (var i = 0; i < props.length; i++) {
                        var descriptor = props[i];
                        descriptor.enumerable = descriptor.enumerable || false;
                        descriptor.configurable = true;
                        if ("value" in descriptor) descriptor.writable = true;
                        Object.defineProperty(target, descriptor.key, descriptor);
                    }
                }

                return function (Constructor, protoProps, staticProps) {
                    if (protoProps) defineProperties(Constructor.prototype, protoProps);
                    if (staticProps) defineProperties(Constructor, staticProps);
                    return Constructor;
                };
            }();

            _export('GenericDatasource', GenericDatasource = function () {
                function GenericDatasource(instanceSettings, $q, backendSrv, templateSrv) {
                    _classCallCheck(this, GenericDatasource);

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

                _createClass(GenericDatasource, [{
                    key: 'query',
                    value: function query(options) {
                        var query = this.buildQueryParameters(options);
                        query.targets = query.targets.filter(function (t) {
                            return !t.hide;
                        });

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
                        }).then(function (res) {
                            var data = [];

                            if (!res.data.results) {
                                return {
                                    data: data
                                };
                            }

                            for (var key in res.data.results) {
                                var queryRes = res.data.results[key];

                                if (queryRes.series) {
                                    var _iteratorNormalCompletion = true;
                                    var _didIteratorError = false;
                                    var _iteratorError = undefined;

                                    try {
                                        for (var _iterator = queryRes.series[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                            var series = _step.value;

                                            data.push({
                                                target: series.name,
                                                datapoints: series.points,
                                                refId: queryRes.refId,
                                                meta: queryRes.meta
                                            });
                                        }
                                    } catch (err) {
                                        _didIteratorError = true;
                                        _iteratorError = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion && _iterator.return) {
                                                _iterator.return();
                                            }
                                        } finally {
                                            if (_didIteratorError) {
                                                throw _iteratorError;
                                            }
                                        }
                                    }
                                }

                                if (queryRes.tables) {
                                    var _iteratorNormalCompletion2 = true;
                                    var _didIteratorError2 = false;
                                    var _iteratorError2 = undefined;

                                    try {
                                        for (var _iterator2 = queryRes.tables[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                            var table = _step2.value;

                                            table.format = 'table';
                                            table.refId = queryRes.refId;
                                            table.meta = queryRes.meta;
                                            data.push(table);
                                        }
                                    } catch (err) {
                                        _didIteratorError2 = true;
                                        _iteratorError2 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                                _iterator2.return();
                                            }
                                        } finally {
                                            if (_didIteratorError2) {
                                                throw _iteratorError2;
                                            }
                                        }
                                    }
                                }
                            }

                            return {
                                data: data
                            };
                        });
                    }
                }, {
                    key: 'testDatasource',
                    value: function testDatasource() {
                        return this.doRequest({
                            url: this.url + '/',
                            method: 'GET'
                        }).then(function (response) {
                            if (response.status === 200) {
                                return { status: "success", message: "Data source is working", title: "Success" };
                            }
                        });
                    }
                }, {
                    key: 'annotationQuery',
                    value: function annotationQuery(options) {
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
                        }).then(function (result) {
                            return result.data;
                        });
                    }
                }, {
                    key: 'metricFindQuery',
                    value: function metricFindQuery(query) {
                        var interpolated = {
                            target: this.templateSrv.replace(query, null, 'regex')
                        };

                        return this.doRequest({
                            url: this.url + '/search',
                            data: interpolated,
                            method: 'POST'
                        }).then(this.mapToTextValue);
                    }
                }, {
                    key: 'mapToTextValue',
                    value: function mapToTextValue(result) {
                        return _.map(result.data, function (d, i) {
                            if (d && d.text && d.value) {
                                return { text: d.text, value: d.value };
                            } else if (_.isObject(d)) {
                                return { text: d, value: i };
                            }
                            return { text: d, value: d };
                        });
                    }
                }, {
                    key: 'doRequest',
                    value: function doRequest(options) {
                        options.withCredentials = this.withCredentials;
                        options.headers = this.headers;

                        return this.backendSrv.datasourceRequest(options);
                    }
                }, {
                    key: 'interpolateVariable',
                    value: function interpolateVariable(value) {
                        if (typeof value === 'string') {
                            return '\'' + value + '\'';
                        }

                        var quotedValues = _.map(value, function (val) {
                            return '\'' + val + '\'';
                        });
                        return quotedValues.join(',');
                    }
                }, {
                    key: 'buildQueryParameters',
                    value: function buildQueryParameters(options) {
                        var _this = this;

                        //remove placeholder targets
                        //options.targets = _.filter(options.targets, target => {
                        //  return target.target !== 'select metric';
                        //});

                        var targets = _.map(options.targets, function (target) {
                            return {
                                rawSql: _this.templateSrv.replace(target.rawSql, options.scopedVars, 'regex'),
                                //target: this.templateSrv.replace(target.rawSql, options.scopedVars, 'regex'),
                                refId: target.refId,
                                hide: target.hide,
                                format: target.format || 'time_series'
                            };
                        });

                        options.queries = targets;

                        return options;
                    }
                }, {
                    key: 'getTagKeys',
                    value: function getTagKeys(options) {
                        var _this2 = this;

                        return new Promise(function (resolve, reject) {
                            _this2.doRequest({
                                url: _this2.url + '/tag-keys',
                                method: 'POST',
                                data: options
                            }).then(function (result) {
                                return resolve(result.data);
                            });
                        });
                    }
                }, {
                    key: 'getTagValues',
                    value: function getTagValues(options) {
                        var _this3 = this;

                        return new Promise(function (resolve, reject) {
                            _this3.doRequest({
                                url: _this3.url + '/tag-values',
                                method: 'POST',
                                data: options
                            }).then(function (result) {
                                return resolve(result.data);
                            });
                        });
                    }
                }]);

                return GenericDatasource;
            }());

            _export('GenericDatasource', GenericDatasource);
        }
    };
});
//# sourceMappingURL=datasource.js.map
