// **The Graph** respresents the database
// You can perform basic actions and queries directly on the entire graphdatabase

// ###[Query Structure](http://docs.neo4j.org/refcard/2.0/)

// Read Query Structure:
// [START]
// [MATCH]
// [WHERE]
// [WITH [ORDER BY] [SKIP] [LIMIT]]
// RETURN [ORDER BY] [SKIP] [LIMIT]
//
// Write-Only Query Structure:
// (CREATE [UNIQUE] | MERGE)*
// [SET|DELETE|FOREACH]*
// [RETURN [ORDER BY] [SKIP] [LIMIT]]
//
// Read-Write Query Structure:
// [START]
// [MATCH]
// [WHERE]
// [WITH [ORDER BY] [SKIP] [LIMIT]]
// [CREATE [UNIQUE]|MERGE]*
// [SET|DELETE|FOREACH]*
// [RETURN [ORDER BY] [SKIP] [LIMIT]]
//
// TODO: maybe check of valid query structure?!


// Initialize the Graph object with a neo4jrestful client
var __initGraph__ = function(neo4jrestful) {

  // Requirements (for browser and nodejs):
  //   * neo4jmapper helpers
  //   * underscorejs

  if (typeof window === 'object') {
    var helpers               = window.Neo4jMapper.helpers;
    var _                     = window._;
    var CypherQuery           = window.Neo4jMapper.CypherQuery;
    var ConditionalParameters = window.Neo4jMapper.ConditionalParameters;
  } else {
    var helpers               = require('./helpers');
    var _                     = require('underscore');
    var CypherQuery           = require('./cypherquery');
    var ConditionalParameters = require('./conditionalparameters')
  }

  // Ensure that we have a Neo4jRestful client we can work with
  if ((typeof neo4jrestful !== 'undefined') && (helpers.constructorNameOfFunction(neo4jrestful) !== 'Neo4jRestful'))
    throw Error('You have to use an Neo4jRestful object as argument')

  // Constructor of Graph
  var Graph = function Graph(url) {
    if (url) {
      this.neo4jrestful = new neo4jrestful.constructor(url);
    }
    this.resetQuery();
    return this;
  }

  Graph.prototype.neo4jrestful                  = neo4jrestful;
  Graph.prototype._query_history_               = null;
  // see graph.resetQuery() for initialization
  Graph.prototype.cypher                        = null;
  Graph.prototype._queryString_                 = '';           // stores a query string temporarily
  Graph.prototype._loadOnResult_                = 'node|relationship|path';
  Graph.prototype._resortResults_               = true;         // see in graph.query() -> _increaseDone()
  Graph.prototype._nativeResults_               = false;        // it's not implemented, all results are processed so far

  Graph.prototype.info                          = null;         // contains the info response of the neo4j database

  Graph.prototype._response_                    = null;         // contains the last response object
  Graph.prototype._columns_                     = null;         // contains `columns` of { columns: [ … ], data: [ … ] }

  Graph.prototype.exec = function(query, cb) {
    if (typeof query !== 'string') {
      cb = query;
      query = this.toCypherQuery();
    }
    if (typeof cb === 'function') {
      this.query(query, {}, cb);
    }
    return this;
  }

  Graph.prototype.query = function(cypherQuery, options, cb) {
    var self = this;
    if (typeof cypherQuery !== 'string') {
      throw Error('First argument must be a query string');
    }
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    if (typeof options !== 'object') {
      options = {};
    }

    options.params = (typeof this.cypher.useParameters === 'boolean') ? this.cypher.parameters : {};
    options.context = self;

    // we expect a cb in most cases and perfom the query immediately
    if (typeof cb === 'function') {
      this.neo4jrestful.query(cypherQuery, options, function(err, res, debug) {
        self._processResult(err, res, debug, options, function(err, res, debug) {
          // Is used by Node on performing an "update" via a cypher query
          // The result length is 1, so we remove the array
          if ((res)&&(res.length===1)&&(options.cypher)) {
            if ((options.cypher.limit === 1) || (options.cypher._update_) || (typeof res[0] !== 'object')) {
              res = res[0];
            }
          }
          cb(err, res, debug);
        });
      });
    } else {
      // otherwise we store the query string and expect it will be executed with `.exec(cb)` or `.stream(cb)`
      this._queryString_ = cypherQuery;
    }

    return this;
  }

  Graph.prototype.__indexOfLabelColumn = function(columns) {
    var labelColumns = this.__indexOfLabelColumns(columns);
    var keys = Object.keys(labelColumns);
    return (keys.length === 1) ? keys[0] : -1;
  }

  Graph.prototype.__indexOfLabelColumns = function(columns) {
    var labelColumns = {};
    if (typeof columns === 'undefined')
      columns = this._columns_;
    for (var i=0; i < columns.length; i++) {
      if (/^labels\([a-zA-Z]+\)$/.test(columns[i]))
        labelColumns[i] = columns[i];
    }
    return labelColumns;
  }

  Graph.prototype.__removeLabelColumnFromArray = function(array, columnIndexOfLabel) {
    if (typeof columnIndexOfLabel !== 'number')
      columnIndexOfLabel = this.__indexOfLabelColumn();
    array.splice(columnIndexOfLabel, 1);
    return array;
  }

  Graph.prototype.__sortOutLabelColumn = function(result) {
    var nodeLabels = [];
    var nodeLabelsColumn = this.__indexOfLabelColumn(result.columns);
    var self = this;
    if (nodeLabelsColumn >= 0) {
      // we have a 'labels(n)' column
      for (var i=0; i < result.data.length; i++) {
        nodeLabels.push(result.data[i][nodeLabelsColumn]);
        result.data[i] = self.__removeLabelColumnFromArray(result.data[i], nodeLabelsColumn);
      }
      this._columns_ = self.__removeLabelColumnFromArray(this._columns_, nodeLabelsColumn);
    }
    return nodeLabels;
  }

  Graph.prototype._processResult = function(err, result, debug, options, cb) {
    var self = options.context;
    self._response_ = self.neo4jrestful._response_;
    self._columns_ = self.neo4jrestful._columns_;
    if (err)
      return cb(err, result, debug);
    var loadNode = /node/i.test(self._loadOnResult_);
    var loadRelationship = /relation/i.test(self._loadOnResult_);
    var loadPath = /path/i.test(self._loadOnResult_);
    var todo = 0;
    var iterationDone = false;

    // if we have the native mode, return results instantly at this point
    // TODO: to be implemented
    if (self._nativeResults_)
      // we turned off all loading hooks and no sorting -> so lets return the native result
      return cb(err, result, debug);

    // increase the number of done jobs
    // resort the results if options is activated
    // and finally invoke the cb if we are done
    var __oneMoreJobDone = function() {
      if ((todo === 0)&&(iterationDone)) {

        if (result.data.length === 0) {
          // empty result
          return cb(err, null, debug);
        }

        // if is set to true, sort result:
        // * return only the data (columns are attached to graph._columns_)
        // * remove array if we only have one column
        // e.g. { columns: [ 'count' ], data: [ { 1 } ] } -> 1
        if (self._resortResults_) {
          var cleanResult = result.data;
          // remove array, if we have only one column
          if (self._columns_.length === 1) {
            for (var row=0; row < cleanResult.length; row++) {
              cleanResult[row] = cleanResult[row][0];
            }
          }
          if ((self.cypher.limit === 1) && (cleanResult.length === 1)) {
            // if we have a limit of 1 we can only get data[0] or null
            cleanResult = (cleanResult.length === 1) ? cleanResult[0] : null;
          }
          cb(err, cleanResult, debug);
        } else {
          cb(err, result, debug);
        }
      } else {
        todo--;
      }
    }



    if ((!result.data)&&(result.length === 1)) {
      return cb(err, result[0], debug);
    }

    // check for node labels column (is attached by query builder) 
    // copy to a new array and remove column from result to the results cleaner
    var nodeLabelsColumn = this.__indexOfLabelColumn(result.columns);
    var nodeLabels = (this._resortResults_) ? this.__sortOutLabelColumn(result) : null;

    var recommendConstructor = options.recommendConstructor;

    for (var row=0; row < result.data.length; row++) {
      for (var column=0; column < result.data[row].length; column++) {
        var data = result.data[row][column];
        // try to create an instance if we have an object here
        if ((typeof data === 'object') && (data !== null))
          self.neo4jrestful.createObjectFromResponseData(result.data[row][column], recommendConstructor);
        // result.data[row][column] = object;
        var object = result.data[row][column];

        if (object) {
          if ((object.classification === 'Node') && (loadNode)) {
            if (nodeLabelsColumn >= 0) {
              // if we have labels(n) column
              var labels = nodeLabels.shift()
              object = self.neo4jrestful.Node.instantiateNodeAsModel(object, labels);
              object.__skip_loading_labels__ = true;
            }
            todo++;            
            object.load(__oneMoreJobDone);
          }
          else if ((object.classification === 'Relationship') && (loadRelationship)) {
            todo++;
            object.load(__oneMoreJobDone);
          }
          else if ((object.classification === 'Path') && (loadPath)) {
            todo++;
            object.load(__oneMoreJobDone);
          }

          result.data[row][column] = object;
        }

      }
    }

    iterationDone = true;
    __oneMoreJobDone();

  }

  // Stream query
  Graph.prototype.stream = function(cypherQuery, options, cb) {
    var self = this;
    var Node = Graph.Node;
    var recommendConstructor = (options) ? options.recommendConstructor || Node : Node;
    if (typeof cypherQuery !== 'string') {
      cb = cypherQuery;
      cypherQuery = this.toCypherQuery();
    }
    else if (typeof options === 'function') {
      cb = options;
      options = undefined;
    }
    var i = 0; // counter is used to prevent changing _columns_ more than once
    var indexOfLabelColumn = null;
    this.neo4jrestful.stream(cypherQuery, options, function(data, response) {
      // neo4jrestful alerady created an object, but not with a recommend constructor
      self._columns_ = response._columns_;
      if ((self._resortResults_)&&(i === 0)) {
        indexOfLabelColumn = self.__indexOfLabelColumn(self._columns_);
        if (indexOfLabelColumn >= 0) {
          // remove [ 'n', 'labels(n)' ] labels(n) column        
          self._columns_ = self.__removeLabelColumnFromArray(self._columns_, indexOfLabelColumn);
        }
      }
      if ((data) && (typeof data === 'object')) {
        if (data.constructor === Array) {
          var labels = null;
          if ((self._resortResults_) && (indexOfLabelColumn >= 0)) {
            labels = data[indexOfLabelColumn];
            data = self.__removeLabelColumnFromArray(data, indexOfLabelColumn);
            if (data.length === 1)
              data = data[0];
          }
          for (var column = 0; column < data.length; column++) {
            if ((data[column]) && (data[column]._response_)) {
              data[column] = self.neo4jrestful.createObjectFromResponseData(data[column]._response_, recommendConstructor);
              data[column] = self.neo4jrestful.Node.instantiateNodeAsModel(data[column], labels);
            }
              
          }
        }
      }
      if ((data) && (data._response_)) {
        data = self.neo4jrestful.createObjectFromResponseData(data._response_, recommendConstructor);
        // data = self.neo4jrestful.Node.instantiateNodeAsModel(data, labels);
      }
      i++;
      cb(data, self);
    });
    return this;
  }

  // Shortcut for .stream
  Graph.prototype.each = Graph.prototype.stream;

  Graph.prototype.parameters = function(parameters) {
    if (typeof parameters !== 'object')
      throw Error('parameter(s) as argument must be an object, e.g. { key: "value" }')
    if (this.cypher.useParameters === null)
      this.cypher.useParameters = true;
    this.cypher.parameters = parameters;
    return this;
  }

  Graph.prototype.addParameters = function(parameters) {
    this.cypher.addParameters(parameters);
    return this;
  }

  // ### Deletes *all* nodes and *all* relationships
  Graph.prototype.wipeDatabase = function(cb) {
    var query = "START n=node(*) MATCH n-[r?]-() DELETE n, r;";
    return this.query(query, cb);
  }

  // ### Counts all objects of a specific type: (all|node|relationship|[nr]:Movie)
  Graph.prototype.countAllOfType = function(type, cb) {
    var query = '';
    if      (/^n(ode)*$/i.test(type))
      query = "START n=node(*) RETURN count(n);"
    else if (/^r(elationship)*$/i.test(type))
      query = "START r=relationship(*) RETURN count(r);";
    else if (/^[nr]\:.+/.test(type))
      // count labels
      query = "MATCH "+type+" RETURN "+type[0]+";";
    else
      query = "START n=node(*) OPTIONAL MATCH n-[r]-() RETURN count(n), count(r);";
    return Graph.query(query, function(err,data){
      if ((data)&&(data.data)) {
        var count = data.data[0][0];
        if (typeof data.data[0][1] !== 'undefined')
          count += data.data[0][1];
        return cb(err, count);
      }
      cb(err,data);
    });
  }

  // ### Counts all relationships
  Graph.prototype.countRelationships = function(cb) {
    return this.countAllOfType('relationship', cb);
  }

  // alias for countRelationships()
  Graph.prototype.countRelations = function(cb) {
    return this.countRelationships(cb);
  }

  // ### Counts all nodes
  Graph.prototype.countNodes = function(cb) {
    return this.countAllOfType('node', cb);
  }

  // ### Counts all relationships and nodes
  Graph.prototype.countAll = function(cb) {
    return this.countAllOfType('all', cb);
  }

  // ### Queries information of the database and stores it on `this.info`
  Graph.prototype.about = function(cb) {
    var self = this;
    if (this.info)
      return cb(null,info);
    else
      return this.neo4jrestful.get('/'+this.neo4jrestful.urlOptions.endpoint, function(err, info){
        if (info) {
          self.info = info
        }
        if (typeof cb === 'function')
          cb(err,info);
      });
  }

  // ### Reset the query history
  Graph.prototype.resetQuery = function() {
    this._query_history_ = [];
    this._queryString_ = '';
    this.cypher = new CypherQuery();
    return this;
  }

  // ### Startpoint to begin query chaining
  // e.g. Graph.start().where( …
  Graph.prototype.start = function(start, cb) {
    this.resetQuery();
    if (typeof start === 'function') {
      cb = start;
      start = null;
    }
    if (start)
      this._query_history_.push({ START: start });
    return this.exec(cb);
  }

  Graph.prototype.match = function(match, cb, options) {
    var self = this;
    if (typeof options !== 'object')
      options = {};
    var matchString = '';
    if ((typeof match === 'object')&&(match.length)) {
      match.forEach(function(item){
        if (typeof item === 'object') {
          if (self.cypher.useParameters)
            matchString += self._addObjectLiteralToParameters(item);
          else
            matchString += helpers.serializeObjectForCypher(item);
        } else {
          matchString += String(item);
        }
      });
    } else {
      matchString = match;
    }
    // do we have "ON MATCH", "OPTIONAL MATCH" or "MATCH" ?
    if (!options.switch)
      this._query_history_.push({ MATCH: matchString });
    else if (options.switch === 'ON MATCH')
      this._query_history_.push({ ON_MATCH: matchString });
    else if (options.switch === 'OPTIONAL MATCH')
      this._query_history_.push({ OPTIONAL_MATCH: matchString });
    return this.exec(cb);
  }

  Graph.prototype.onMatch = function(onMatch, cb) {
    return this.match(onMatch, cb, { switch: 'ON MATCH' });
  }

  Graph.prototype.optionalMatch = function(optionalMatch, cb) {
    return this.match(optionalMatch, cb, { switch: 'OPTIONAL MATCH' });
  }

  Graph.prototype.with = function(withStatement, cb) {
    this._query_history_.push({ WITH: withStatement });
    return this.exec(cb);
  }

  Graph.prototype.skip = function(skip, cb) {
    skip = parseInt(skip);
    if (skip === NaN)
      throw Error('SKIP must be an integer');
    this._query_history_.push({ SKIP: skip });
    return this.exec(cb);
  }

  Graph.prototype.limit = function(limit, cb) {
    limit = parseInt(limit);
    if (limit === NaN)
      throw Error('LIMIT must be an integer');
    this._query_history_.push({ LIMIT: limit });
    this.cypher.limit = limit; // TODO: implement: if limit 1 only return { r } or null instead if [ { r } ]
    return this.exec(cb);
  }

  Graph.prototype.merge = function(merge, cb) {
    // TODO: values to parameter
    this._query_history_.push({ MERGE: merge });
    return this.exec(cb);
  }

  Graph.prototype.custom = function(statement, cb) {
    if ((typeof statement === 'object') && (typeof statement.toQuery === 'function')) {
      this._query_history_.push(statement.toQuery().toString());
    } else {
      this._query_history_.push(statement);
    }
    return this.exec(cb);
  }

  // will be used to send statements
  // Graph.prototype.statement = null;

  Graph.prototype.set = function(set, cb) {
    if ((typeof set === 'object')&&(set.constructor === Array)) {
      set = set.join(', ');
    }
    this._query_history_.push({ SET: set });
    return this.exec(cb);
  }

  Graph.prototype.create = function(create, cb) {
    this._query_history_.push({ CREATE: create });
    return this.exec(cb);
  }

  Graph.prototype.onCreate = function(onCreate, cb) {
    this._query_history_.push({ ON_CREATE: onCreate });
    return this.exec(cb);
  }

  Graph.prototype.createUnique = function(create, cb) {
    this._query_history_.push({ CREATE_UNIQUE: create });
    return this.exec(cb);
  }

  Graph.prototype.createIndexOn = function(createIndexOn, cb) {
    this._query_history_.push({ CREATE_INDEX_ON: createIndexOn });
    return this.exec(cb);
  }

  Graph.prototype.case = function(caseStatement, cb) {
    this._query_history_.push({ CASE: caseStatement.replace(/END\s*$/i,'') + ' END ' });
    return this.exec(cb);
  }

  Graph.prototype.dropIndexOn = function(dropIndexOn, cb) {
    this._query_history_.push({ DROP_INDEX_ON: dropIndexOn });
    return this.exec(cb);
  }

  Graph.prototype.orderBy = function(property, cb) {
    var direction = ''
      , s = '';
    if (typeof property === 'object') {
      var key = Object.keys(property)[0];
      cb = direction;
      direction = property[key];
      property = key;
      direction = ( (typeof direction === 'string') && ((/^(ASC|DESC)$/).test(direction)) ) ? direction : 'ASC';
      s = property+' '+direction;
    } else if (typeof property === 'string') {
      s = property;
    }
    this._query_history_.push({ ORDER_BY: s });
    return this.exec(cb);
  }

  Graph.prototype.where = function(where, cb) {
    if (typeof where === 'string') {
      this._query_history_.push({ WHERE: where });
      return this.exec(cb);
    }
    if (this.cypher.useParameters === null)
      this.cypher.useParameters = true;
    if (!_.isArray(where))
      where = [ where ];
    var options = { valuesToParameters: this.cypher.useParameters };
    var condition = new ConditionalParameters(where, options)
    , whereCondition = condition.toString().replace(/^\(\s(.+)\)$/, '$1');
    this._query_history_.push({ WHERE: whereCondition });
    if (this.cypher.useParameters)
      this._addParametersToCypher(condition.parameters);
    return this.exec(cb);
  }

  Graph.prototype.return = function(returnStatement, cb, distinct) {
    var parts = [];
    if (returnStatement) {
      if (returnStatement.constructor === Array)
        parts = returnStatement;
      if ((typeof returnStatement === 'Object') && (Object.keys(returnStatement).length > 0))
        Object.keys(returnStatement).forEach(function(key) {
          parts.push(key+' AS ' + returnStatement[key]);
        });
    }
    if (parts.length > 0)
      returnStatement = parts.join(', ');
    if (distinct === true)
      this._query_history_.push({ RETURN_DISTINCT: returnStatement });
    else
      this._query_history_.push({ RETURN: returnStatement });
    return this.exec(cb);
  }

  Graph.prototype.returnDistinct = function(returnStatement, cb) {
    return this.return(returnStatement, cb, true);
  }

  Graph.prototype.delete = function(deleteStatement, cb) {
    this._query_history_.push({ DELETE: deleteStatement });
    return this.exec(cb);
  }

  Graph.prototype.remove = function(remove, cb) {
    this._query_history_.push({ REMOVE: remove });
    return this.exec(cb);
  }

  Graph.prototype.foreach = function(foreach, cb) {
    this._query_history_.push({ FOREACH: foreach });
    return this.exec(cb);
  }

  Graph.prototype.union = function(s, cb) {
    this._query_history_.push({ UNION: s });
    return this.exec(cb);
  }

  Graph.prototype.using = function(s, cb) {
    this._query_history_.push({ USING: s });
    return this.exec(cb);
  }

  Graph.prototype.comment = function(comment, cb) {
    this.custom(' /* '+comment.replace(/^\s*\/\*\s*/,'').replace(/\s*\*\/\s*$/,'')+' */ ');
    return this.exec(cb);
  }

  Graph.prototype.toQuery = function() {
    // if a query string is attached, return this and skip query building
    if (this._queryString_) {
      return this._queryString_;
    }
    this.cypher.statements = this._query_history_;
    return this.cypher;
  }

  Graph.prototype.toQueryString = function() {
    return this.toQuery().toString();
  }

  Graph.prototype.toCypherQuery = function() {
    this.toQueryString();
    return this.toQuery().toCypher();
  }

  // # Enables loading for specific types
  // Define type(s) simply in a string
  // e.g.:
  // 'node|relationship|path' or '*' to enable load for all types
  // 'node|relationship' to enable for node + relationships
  // '' to disable for all (you can also use `disableLoading()` instead)
  Graph.prototype.enableLoading = function(classifications) {
    if (classifications === '*')
      classifications = 'node|relationship|path';
    this._loadOnResult_ = classifications;
    return this;
  }

  // # Disables loading on results (speeds up queries but less convenient)
  Graph.prototype.disableLoading = function() {
    this._loadOnResult_ = '';
    return this;
  }

  // # Sort Results
  // By default we get results like:
  // { columns: [ 'node' ], data: [ [ { nodeObject#1 } ], … [ { nodeObject#n} ]] }
  // To keep it more handy, we return just the data
  // and (if we have only 1 column) instead of [ {node} ] -> {node}
  // If you want to have access to the columns anyway, you can get them on `graph._columns_`
  Graph.prototype.sortResult = function(trueOrFalse) {
    if (typeof trueOrFalse === 'undefined')
      trueOrFalse = true;
    this._resortResults_ = trueOrFalse;
    return this;
  }

  Graph.prototype.enableSorting = function() {
    return this.sortResult(true);
  }

  Graph.prototype.disableSorting = function() {
    return this.sortResult(false);
  }

  Graph.prototype.enableProcessing = function() {
    this.sortResult(true);
    this.enableLoading('*');
    return this;
  }

  Graph.prototype.disableProcessing = function() {
    this.sortResult(false);
    this.disableLoading();
    return this;
  }

  Graph.prototype.log = function(){ /* > /dev/null */ };

  // Expect s.th. like [ value, value2 ] or [ { key1: value }, { key2: value } ]
  Graph.prototype._addParametersToCypher = function(parameters) {
    if ( (typeof parameters === 'object') && (parameters) && (parameters.constructor === Array) ) {
      if (!this.cypher.hasParameters())
        this.cypher.parameters = {};
      for (var i=0; i < parameters.length; i++) {
        this._addParameterToCypher(parameters[i]);
      }
    } else {
      throw Error('You need to pass parameters as array');
    }
    return this.cypher.parameters;
  }

  // Expect s.th. like 'value' or { parameterkey: 'value' }
  Graph.prototype._addParameterToCypher = function(parameter) {
    if (!this.cypher.hasParameters())
      this.cypher.parameters = {};
    if (typeof parameter === 'object') {
      _.extend(this.cypher.parameters, parameter);
    } else {
      // we name the parameter with `_value#_`
      var count = Object.keys(this.cypher.parameters).length;
      this.cypher.parameters['_value'+count+'_'] = parameter;
      // return the placeholder
      return '{_value'+count+'_}';
    }
    return this.cypher.parameters;
  }

  Graph.prototype._addObjectLiteralToParameters = function(o) {
    o = helpers.flattenObject(o);
    var values = [];
    var key = '';
    for (var attr in o) {
      values.push(attr+' : '+this._addParameterToCypher(o[attr])); 
    }
    return '{ '+values.join(', ')+' }';
  }

  /*
   * Static methods
   * (are shortcuts to methods on new instanced Graph())
   */
  Graph.query = function(cypher, options, cb) {
    return Graph.disableProcessing().query(cypher, options, cb);
  }

  Graph.stream = function(cypher, options, cb) {
    return new Graph.disableProcessing().stream(cypher, options, cb);
  }

  Graph.wipeDatabase = function(cb) {
    return new Graph().wipeDatabase(cb);
  }

  Graph.countAllOfType = function(type, cb) {
    return new Graph().countAllOfType(type, cb);
  }

  Graph.countRelationships = function(cb) {
    return new Graph().countRelationships(cb);
  }

  Graph.countRelations = function(cb) {
    return new Graph().countRelationships(cb);
  }

  Graph.countNodes = function(cb) {
    return new Graph().countNodes(cb);
  }

  Graph.countAll = function(cb) {
    return new Graph().countAll(cb);
  }

  Graph.about = function(cb) {
    return new Graph().about(cb);
  }

  Graph.start = function(start, cb) {
    return new Graph().enableProcessing().start(start, cb);
  }

  Graph.custom = function(statement, cb) {
    return Graph.start().custom(statement, cb);
  }

  Graph.match = function(statement, cb) {
    return Graph.start().match(statement, cb);
  }

  Graph.where = function(statement, cb) {
    return Graph.start().where(statement, cb);
  }

  Graph.return = function(statement, cb) {
    return Graph.start().return(statement, cb);
  }

  Graph.enableLoading = function(classifications) {
    return Graph.start().enableLoading(classifications);
  }

  Graph.disableLoading = function() {
    return Graph.start().disableLoading();
  }

  Graph.disableProcessing = function() {
    return Graph.start().disableProcessing();
  }

  Graph.enableProcessing = function() {
    return Graph.start().enableProcessing();
  }

  Graph.enableSorting = function() {
    return Graph.start().enableSorting();
  }

  Graph.disableSorting = function() {
    return Graph.start().disableSorting();
  }

  Graph.request = function() {
    // creates a new neo4jrestful client
    return neo4jrestful.singleton();
  }

  Graph.new = function(url) {
    return new Graph(url);
  }

  Graph.create = function(statement, cb) {
    return Graph.start().create(statement, cb);
  }

  return neo4jrestful.Graph = Graph;
}

if (typeof window !== 'object') {
  module.exports = exports = {
    init: __initGraph__
  };
} else {
  window.Neo4jMapper.initGraph = __initGraph__;
}