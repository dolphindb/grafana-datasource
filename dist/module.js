import {DolphinDBDatasource} from './datasource';
import {DolphinDBDatasourceQueryCtrl} from './query_ctrl';

class DolphinDBConfigCtrl {}
DolphinDBConfigCtrl.templateUrl = 'partials/config.html';

class DolphinDBQueryOptionsCtrl {}
DolphinDBQueryOptionsCtrl.templateUrl = 'partials/query.options.html';

class DolphinDBAnnotationsQueryCtrl {}
DolphinDBAnnotationsQueryCtrl.templateUrl = 'partials/annotations.editor.html'

export {
  DolphinDBDatasource as Datasource,
  DolphinDBDatasourceQueryCtrl as QueryCtrl,
  DolphinDBConfigCtrl as ConfigCtrl,
  DolphinDBQueryOptionsCtrl as QueryOptionsCtrl,
  DolphinDBAnnotationsQueryCtrl as AnnotationsQueryCtrl
};
