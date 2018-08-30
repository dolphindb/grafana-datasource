import {QueryCtrl} from 'app/plugins/sdk';
import './css/query-editor.css!'


const defaultSql = "select [time_field] as time_sec,[field1] as serie1,[field2] as serie2 where $timeFilter"
export class GenericDatasourceQueryCtrl extends QueryCtrl {

  constructor($scope, $injector)  {
    super($scope, $injector);

    this.scope = $scope;
    this.target.rawSql = this.target.rawSql || defaultSql;
    //this.target.target = this.target.target || 'select metric';
    this.target.format = this.target.format || 'time_series';
  }

  getOptions(query) {
    return this.datasource.metricFindQuery(query || '');
  }

  toggleEditorMode() {
    this.target.rawQuery = !this.target.rawQuery;
  }

  onChangeInternal() {
    this.panelCtrl.refresh(); // Asks the panel to refresh data.
  }
}

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';

