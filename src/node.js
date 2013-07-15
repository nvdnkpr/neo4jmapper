var helpers = null
  , _ = null
  , Sequence = null;

if (typeof window === 'object') {
  // browser
  // TODO: find a solution for bson object id
  helpers  = neo4jmapper_helpers;
  _        = window._;
  Sequence = window.Sequence;
} else {
  // nodejs
  helpers  = require('./helpers');
  _        = require('underscore');
  Sequence = require('./lib/sequence');
}

var cypher_defaults = {
  limit: '',
  skip: '',
  sort: '',
  filter: '',
  match: '',
  start: '',
  set: '',
  return_properties: [],
  where: [],
  // and_where: [],
  from: null,
  to: null,
  direction: null,
  order_by: '',
  order_direction: '', // ASC or DESC
  relation: '',
  outgoing: null,
  incoming: null,
  With: null,
  distinct: null,
  label: null,
  node_identifier: null, // can be a|b|n
  by_id: null,
  // flasgs
  _count: null,
  _distinct: null,
  by_id: null
};

/*
 * Constructor
 */
Node = function Node(data, id) {
  // will be used for labels and classes
  if (!this.constructor_name)
    this.constructor_name = helpers.constructorNameOfFunction(this) || 'Node';
  // each node object has it's own restful client
  //this.neo4jrestful = new Node.prototype.neo4jrestful.constructor(Node.prototype.neo4jrestful.baseUrl);
  this.init(data, id);
}

Node.prototype.init = function(data, id) {
  this.id = id || null;
  this.data = _.extend({}, data);
  this.resetQuery();
  if (id) {
    this.setUriById(id);
  }
  // nested objects must be extended nestedly
  this.fields = _.extend({}, {
    defaults: _.extend({}, this.fields.defaults),
    indexes: _.extend({}, this.fields.indexes),
    unique: _.extend({}, this.fields.unique)
  });
  this.labels = [];
  this.is_instanced = true;
  // we will use a label by default if we have defined an inherited class of node
  if ((this.constructor_name !== 'Node')&&(this.constructor_name !== 'Relationship')&&(this.constructor_name !== 'Path')) {
    this.label = this.cypher.label = this.constructor_name;
  }
  // each node gets it's own client
  this.neo4jrestful = _.extend({}, Node.prototype.neo4jrestful);
  this.neo4jrestful.header = _.extend({}, Node.prototype.neo4jrestful.header);
}

/*
 * Instantiate a node from a specific model
 * Model can be a constructor() or a 'string'
 * and must be registered in Node::registered_models()
 */
Node.prototype.convert_node_to_model = function(node, model, fallbackModel) {
  if (node.hasId()) {
    if (typeof fallbackModel !== 'function')
      fallbackModel = this.constructor;
    if (typeof model === 'function') {
      model = model.constructor_name || helpers.constructorNameOfFunction(model) || null;
    } else if (node.label) {
      model = node.label;
    } else if (typeof fallbackModel === 'function') {
      model = helpers.constructorNameOfFunction(fallbackModel);
    } else {
      throw Error('No model or label found')
    }
    var Class = Node.registered_model(model) || fallbackModel;
    var singleton = new Class()
    // node.constructor_name = singleton.constructor_name;
    return node.copyTo(singleton);
  }
  return null;
}

Node.__models__ = {}; // contains globally all registeresd models

Node.prototype.neo4jrestful = null; // will be initialized
Node.prototype.data = {};
Node.prototype.id = null;
Node.prototype._id_ = null; // _id_ is the private key store to ensure that this.id deosn't get manipulated accidently
Node.prototype.fields = {
  defaults: {},
  indexes: {},
  unique: {}
};

Node.prototype.uri = null;
Node.prototype._response = null;
Node.prototype._modified_query = false;
Node.prototype._stream_ = null; // flag for processing result data
Node.prototype.is_singleton = false;
Node.prototype.is_persisted = false;
Node.prototype.cypher = {};
Node.prototype.is_instanced = null;

Node.prototype.labels = null;
Node.prototype.label = null;
Node.prototype.constructor_name = null;

Node.prototype._load_hook_reference_ = null;

Node.prototype.__already_initialized__ = false; // flag to avoid many initializations

// you should **never** change this value
// it's used to dictinct nodes and relationships
// many queries containg `node()` command will use this value
// e.g. n = node(*)
Node.prototype.__type__ = 'node';
Node.prototype.__type_identifier__ = 'n';


Node.prototype.singleton = function(id, label) {
  var Class = this.constructor;
  var node = new Class({},id);
  if (typeof label === 'string')
    node.label = label;
  node.resetQuery();
  node.is_singleton = true;
  node.resetQuery();
  return node;
}

Node.prototype.initialize = function(cb) {
  var self = this;
  if (typeof cb !== 'function')
    cb = function() { /* /dev/null */ };
  if (!this.__already_initialized__) {
    return this.onBeforeInitialize(function(err){
      self.onAfterInitialize(cb);
    });
  } else {
    return cb(null, null);
  }
}

Node.prototype.onBeforeInitialize = function(next) { next(null,null); }

Node.prototype.onAfterInitialize = function(cb) {
  var self = this;
  this.__already_initialized__ = true;
  // Index fields
  var fieldsToIndex = this.fieldsForAutoindex();
  var fieldsWithUniqueValues = this.fieldsWithUniqueValues();
  // we create an object to get the label
  var node = new this.constructor();
  var label = node.label;
  if (label) {
    if (fieldsToIndex.length > 0) {
      node.ensureIndex({ label: label, fields: fieldsToIndex }, function(err){
        cb(null, null);
      });
    }
    // inactive
    // http://docs.neo4j.org/chunked/snapshot/query-constraints.html
    /*
    if (fieldsWithUniqueValues === 'deactivated, because it´s not implemented in neo4j, yet') {
      _.each(fieldsWithUniqueValues, function(isUnique, field) {
        if (isUnique)
          //CREATE CONSTRAINT ON (book:Book) ASSERT book.isbn IS UNIQUE
          self.neo4jrestful.query('CREATE CONSTRAINT ON (n:'+label+') ASSERT n.`'+field+'` IS UNIQUE;', function(err, result, debug) {
            // maybe better ways how to report if an error occurs
            cb(err, result, debug);
          });
      });
    }*/
  } else {
    cb(Error('No label found'), null);
  }
}

/*
 * Copys only the relevant data(s) of a node to another object
 */
Node.prototype.copyTo = function(n) {
  n.id = n._id_ = this._id_;
  n.data   = _.extend(this.data);
  n.labels = _.clone(this.labels);
  if (this.label)
    n.label  = this.label;
  n.uri = this.uri;
  n._response = _.extend(this._response);
  return n;
}

Node.prototype.resetQuery = function() {
  this.cypher = {}
  _.extend(this.cypher, cypher_defaults);
  this.cypher.where = [];
  this.cypher.match = [];
  this.cypher.return_properties = [];
  this._modified_query = false;
  if (this.id)
    this.cypher.from = this.id;
  return this; // return self for chaining
}

Node.prototype.hasId = function() {
  return ((this.is_instanced) && (this.id > 0)) ? true : false;
}

Node.prototype.setUriById = function(id) {
  if (_.isNumber(id))
    return this.uri = this.neo4jrestful.baseUrl+'db/data/node/'+id;
}

Node.prototype.flattenData = function(useReference) {
  // strongly recommend not to mutate attached node's data
  if (typeof useReference !== 'boolean')
    useReference = false;
  this._modified_query = false;
  if ((typeof this.data === 'object') && (this.data !== null)) {
    var data = (useReference) ? this.data : _.extend(this.data);
    data = helpers.flattenObject(data);
    // remove null values since nodejs cant store them
    for(var key in data) {
      if ((typeof data[key] === 'undefined') || (data[key]===null))
        delete data[key];
    }
    return data;
  }
  return this.data;
}

Node.prototype.unflattenData = function(useReference) {
  // strongly recommend not to mutate attached node's data
  if (typeof useReference !== 'boolean')
    useReference = false;
  this._modified_query = false;
  var data = (useReference) ? this.data : _.extend(this.data);
  return helpers.unflattenObject(data);
}

Node.prototype.hasValidData = function() {
  return helpers.isValidData(this.data);
}

Node.prototype.applyDefaultValues = function() {
  // flatten data and defaults
  var data     = helpers.flattenObject(this.data);
  var defaults = helpers.flattenObject(this.fields.defaults);
  for (var key in defaults) {
    if (((typeof data[key] === 'undefined')||(data[key] === null))&&(typeof defaults[key] !== 'undefined'))
      // set a default value by defined function
      if (typeof defaults[key] === 'function')
        data[key] = defaults[key](this);
      else
        data[key] = defaults[key];
  }
  this.data = helpers.unflattenObject(data);
  return this;
}

Node.prototype.hasFieldsToIndex = function() {
  if (this.hasId())
    return _.keys(this.fields.indexes).length;
  else
    return null;
}

Node.prototype.fieldsToIndex = function() {
  return ( (this.fields.indexes) && (_.keys(this.fields.indexes).length > 0) ) ? helpers.flattenObject(this.fields.indexes) : null;
}

Node.prototype.fieldsForAutoindex = function() {
  var fields = this.fieldsToIndex();
  var keys = [];
  _.each(fields, function(toBeIndexed, field) {
    if (toBeIndexed === true) 
      keys.push(field);
  });
  return keys;
}

Node.prototype.fieldsWithUniqueValues = function() {
  return ( (this.fields.unique) && (_.keys(this.fields.unique).length > 0) ) ? this.fields.unique : null;
}

Node.prototype.indexFields = function(cb) {
  var fieldsToIndex = this.fieldsToIndex();
  if (fieldsToIndex) {
    // var join = Join.create();
    var doneCount = 0;
    var todoCount = 0;
    // var max = Object.keys(fieldsToIndex).length;
    for (var key in fieldsToIndex) {
      var namespace = this.fields.indexes[key];
      var value = this.data[key];
      if ((_.isString(namespace))&&(typeof value !== 'undefined')&&(value !== null)) {
        todoCount++;
        this.addIndex(namespace, key, value, function(err, data, debug){
          doneCount = doneCount+1;
          // done
          if (doneCount >= todoCount)
            cb(null, doneCount);
        });
      }
    }
    if (todoCount === 0)
      cb(null, doneCount);
  }
  return null;
}

/*
 * http://docs.neo4j.org/chunked/milestone/rest-api-schema-indexes.html#rest-api-list-indexes-for-a-label
 */
Node.prototype.ensureIndex = function(options, cb) {
  var args;
  ( ( args = helpers.sortOptionsAndCallbackArguments(options, cb) ) && ( options = args.options ) && ( cb = args.callback ) );
  options = _.extend({
    label: this.label,
    fields: this.fieldsForAutoindex(),
    action: null
  }, options);
  var self    = this;
  var keys    = options.fields;
  var todo    = keys.length;
  var done    = 0;
  var errors  = [];
  var results = [];
  if (!options.label)
    return cb(Error('Label is mandatory, you can set the label as options as well'), null);
  var url = '/db/data/schema/index/'+options.label;
  if (keys.length === 0)
    return cb(Error("No keys for indexing found in schema"), null);
  _.each(keys, function(key){
    self.neo4jrestful.post(url, { data: { property_keys: [ key ] } }, function(err, res) {
      done++;
      if ((typeof err === 'object') && (err !== null)) {
        if ((err.cause) && (err.cause.cause) && (err.cause.cause.exception === 'AlreadyIndexedException'))
          // we ignore this "error"
          results.push(res);
        else
          errors.push(err);
      } else {
        results.push(res);
      }
      if (done === todo)
        cb((errors.length > 0) ? errors : null, results);
    });
  });
}

Node.prototype.dropIndex = function(fields, cb) {
  var self = this;
  if (typeof fields === 'function') {
    cb = fields;
    fields = this.fieldsForAutoindex();
  }
  if (!this.label)
    return cb(Error("You need to set a label on `node.label` to work with autoindex"), null);
  var todo = fields.length;
  var done = 0;
  var url  = '/db/data/schema/index/'+this.label;
  // skip if no fields
  if (todo === 0)
    return cb(null, null);
  var errors  = [];
  var results = [];
  if (todo===0)
    return cb(Error("No fields for indexing found", null));
  _.each(fields, function(field) {
    self.neo4jrestful.delete(url+'/'+field, function(err, res){
      done++;
      // if (err)
      //   errors.push(err);
      // else
      //   results.push(res);
      if (done === todo)
        cb(null, null);
    });
  });
  return this;
}

Node.prototype.dropEntireIndex = function(cb) {
  var self = this;
  this.getIndex(function(err, fields){
    if (err)
      return cb(err, fields);
    return self.dropIndex(fields, cb);
  });
}

Node.prototype.getIndex = function(cb) {
  var label = this.label;
  if (!label)
    return cb(Error("You need to set a label on `node.label` to work with autoindex"), null);
  var url = '/db/data/schema/index/'+this.label;
  return this.neo4jrestful.get(url, function(err, res){
    if ((typeof res === 'object') && (res !== null)) {
      var keys = [];
      _.each(res, function(data){
        if (data.label === label)
          keys.push(data['property-keys']);
      });
      return cb(null, _.flatten(keys));
    } else {
      return cb(err, res);
    }
  });
}

Node.prototype.save = function(cb) {
  var self = this;
  self.onBeforeSave(self, function(err) {
    // don't execute if an error is passed through
    if ((typeof err !== 'undefined')&&(err !== null))
      cb(err, null);
    else
      self.onSave(function(err, node, debug) {
        self.onAfterSave(self, cb, debug);
      });
  });
}

Node.prototype.onBeforeSave = function(node, next) { next(null, null); }

Node.prototype.onSave = function(cb) {
  var self = this;
  if (this.is_singleton)
    return cb(Error('Singleton instances can not be persisted'), null);
  if (!this.hasValidData())
    return cb(Error('Node does not contain valid data. `node.data` must be an object.'));
  this._modified_query = false;
  this.applyDefaultValues();
  var method = null;

  function _prepareData(err, data, debug) {
    // copy persisted data on initially instanced node
    data.copyTo(self);
    data = self;
    self.is_singleton = false;
    self.is_instanced = true;
    self.is_persisted = true;
    // if we have defined fields to index
    // we need to call the cb after indexing
    if (self.hasFieldsToIndex()) {
      return self.indexFields(function(){
        if (debug)
          debug.indexedFields = true;
        cb(null, data, debug);
      });
    }
    else
      return cb(null, data, debug);
  }
  
  this.id = this._id_;

  if (this.id > 0) {
    method = 'update';
    this.neo4jrestful.put('/db/data/node/'+this._id_+'/properties', { data: this.flattenData() }, function(err, node, debug) {
      if ((err) || (!node))
        return cb(err, node);
      self.populateWithDataFromResponse(node._response);
      cb(err, node, debug);
    });
  } else {
    method = 'create';   
    this.neo4jrestful.post('/db/data/node', { data: this.flattenData() }, function(err, node, debug) {
      if ((err) || (!node))
        return cb(err, node);
      _prepareData(err, node, debug);
    });
  }
}

Node.prototype.onAfterSave = function(node, next, debug) {
  var labels = node.labelsAsArray();
  if ((typeof err !== 'undefined')&&(err !== null)) {
    return next(err, node, debug);
  } else {
    if (labels.length > 0) {
      // we need to post the label in an extra reqiuest
      // cypher inappropriate since it can't handle { attributes.with.dots: 'value' } …
      node.createLabels(labels, function(labelError, notUseableData, debugLabel) {
        // add label err if we have one
        if (labelError)
          err = (err) ? [ err, labelError ] : labelError;
        // add debug label if we have one
        if (debug)
          debug = (debugLabel) ? [ debug, debugLabel ] : debug;
        return next(labelError, node, debug);
      });
    } else {
      return next(null, node, debug);
    }
  }
}

Node.prototype.update = function(data, cb) {
  var self = this;
  if (!helpers.isValidData(data)) {
    cb(Error('To perform an update you need to pass valid data for updating as first argument'), null);
  }
  else if (this.hasId()) {
    this.findById(this._id_).update(data, cb);
    return this;
  } else {
    data = helpers.flattenObject(data);
    this.cypher.set = [];
    for (var attribute in data) {
      this.cypher.set.push(helpers.cypherKeyValueToString(attribute, data[attribute], this.__type_identifier__));
    }
  }
  this.exec(cb);
  return this;
}

Node.prototype.load = function(cb) {
  var self = this;
  this.onBeforeLoad(self, function(err, node){
    if (err)
      cb(err, node);
    else
      self.onAfterLoad(node, cb);
  })
}

Node.prototype.onBeforeLoad = function(node, next) {
  var self = this;
  if (node.hasId()) {
    var DefaultConstructor = this.recommendConstructor();
    // To check that it's invoked by Noder::find() or Person::find()
    var constructorNameOfStaticMethod = helpers.constructorNameOfFunction(DefaultConstructor);
    node.allLabels(function(err, labels, debug) {
      if (err)
        return next(err, labels);
      node.labels = _.clone(labels);
      if (labels.length === 1)
        node.label = labels[0]
      // convert node to it's model if it has a distinct label and differs from static method
      if ( (node.label) && (node.label !== constructorNameOfStaticMethod) )
        node = Node.prototype.convert_node_to_model(node, node.label, DefaultConstructor);
      next(null, node);
    });
  } else {
    next(null, node);
  } 
}

Node.prototype.onAfterLoad = function(node, next) {
  next(null, node);
}

Node.prototype.disableLoading = function() {
  if (typeof this.load === 'function') {
    this._load_hook_reference_ = this.load;
    this.load = null;
  }
  return this;
}

Node.prototype.enableLoading = function() {
  if (typeof this._load_hook_reference_ === 'function') {
    this.load = this._load_hook_reference_;
    this._load_hook_reference_ = null;
  }
  return this;
}

Node.prototype.populateWithDataFromResponse = function(data) {
  // if we are working on the prototype object
  // we won't mutate it and create a new node instance insetad
  var node;
  if (!this.is_instanced)
    node = new Node();
  else
    node = this;
  node._modified_query = false;
  if (data) {
    if (_.isObject(data) && (!_.isArray(data)))
      node._response = data;
    else
      node._response = data[0];
    node.data = node._response.data;
    node.data = node.unflattenData();
    node.uri  = node._response.self;
    //'http://localhost:7474/db/data/node/3648'
    if ((node._response.self) && (node._response.self.match(/[0-9]+$/))) {
      node.id = node._id_ = Number(node._response.self.match(/[0-9]+$/)[0]);
    }
  }
  node.is_persisted = true;
  if (typeof node.onAfterPopulate === 'function')
    node.onAfterPopulate();
  return node;
}

Node.prototype.onAfterPopulate = function() {
  return this;
}

/*
 * Query Methods (via chaining)
 */

Node.prototype.withLabel = function(label, cb) {
  var self = this;
  // return here if we have an instances node
  if ( (self.hasId()) || (typeof label !== 'string') )
    return self; // return self for chaining
  self._modified_query = true;
  self.cypher.label = label;
  self.exec(cb);
  return self; // return self for chaining
}

Node.prototype.shortestPathTo = function(end, type, cb) {
  if (typeof type === 'function') {
    cb = type;
    type = '';
  }
  return this.pathBetween(this, end, { 'type': type, 'algorithm' : 'shortestPath' }, function(err, result, debug){
    if ((!err)&&(result))
      // shortestPath result has always only one result
      return cb(err, result[0], debug);
    else
      return cb(err, result, debug);
  });
  return null;
}

Node.prototype.pathBetween = function(start, end, options, cb) {
  var self = this;
  var defaultOptions = {
    'max_depth': 0,
    'relationships': {
      'type': '',
      'direction': 'out'  // not in use, yet
    },
    'algorithm' : 'shortestPath'
  };
  if (typeof options === 'object') {
    options = _.extend(defaultOptions, options);
  } else {
    cb = options;
    options = _.extend(defaultOptions);
  }
  // allow shorthands for easier usage
  if (options.max)
    options.max_depth = options.max;
  if (options.type)
    options.relationships.type = options.type;
  if (options.direction)
    options.relationships.direction = options.direction;
  start = helpers.getIdFromObject(start);
  end = helpers.getIdFromObject(end);
  if ((start)&&(end)) {
    // START martin=node(3), michael=node(7)
    // MATCH p = allShortestPaths(martin-[*]-michael)
    // RETURN p
    var type = (options.relationships.type) ? ':'+options.relationships.type : options.relationships.type;
    this.cypher.start = 'a = node('+start+'), b = node('+end+')';
    
    var matchString = 'p = '+options.algorithm+'(a-['+type+( (options.max_depth>0) ? '..'+options.max_depth : '*' )+']-b)';
    
    this.cypher.match.push(matchString.replace(/\[\:\*+/, '[*'));
    this.cypher.return_properties = ['p'];
  }

  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.count = function(identifier, cb) {
  this._modified_query = true;
  this.cypher._count = true;
  if (typeof identifier === 'function') {
    cb = identifier;
    identifier = '*';
  }
  else if (typeof identifier !== 'string')
    identifier = '*';

  if (!this.cypher.start) {
    this.cypher.start = this.__type_identifier__+' = '+this.__type__+'(*)'; // all nodes by default
  }
  this.cypher.return_properties = 'COUNT('+((this.cypher._distinct) ? 'DISTINCT ' : '')+identifier+')';
  if (this.cypher._distinct)
    this.cypher._distinct = false;
  // we only need the count column to return in this case
  if (typeof cb === 'function')
    this.exec(function(err, result, debug){
      if ((result)&&(result.data)) {
        if (result.data.length === 1)
          result = result.data[0][0];
      }
      cb(err, result, debug);
    });
  return this; // return self for chaining
}

/*
 * Query-Building methods
 */

Node.prototype._prepareQuery = function() {
  var query = _.extend(this.cypher);
  var label = (query.label) ? ':'+query.label : '';

  if (!query.start) {
    if (query.from > 0) {
      query.start = 'n = node('+query.from+')';
      query.return_properties.push('n');
    }
    if (query.to > 0) {
      query.start += ', m = node('+query.to+')';
      query.return_properties.push('m');
    }
  }

  var relationships = '';

  if ((query.return_properties)&&(query.return_properties.constructor === Array))
    query.return_properties = _.uniq(query.return_properties).join(', ')

  if (query.relationship) {
    if (query.relationship.constructor === Array) {
      relationships = ':'+helpers.escapeString(query.relationship.join('|'));
    } else {
      relationships = ':'+helpers.escapeString(query.relationship);
    }
  }

  // build in/outgoing directions
  if ((query.incoming)||(query.outgoing)) {
    // query.outgoing = (query.outgoing) ? query.outgoing : '-';
    // query.incoming = (query.incoming) ? query.incoming : '-';
    var x = '';
    var y = '';
    if ((query.incoming)&&(query.outgoing))
      x = y = '-';
    else {
      if (query.incoming) {
        x = '<-';
        y = '-';
      }
      if (query.outgoing) {
        x = '-';
        y = '->';
      }
    }
    query.match.push('(n'+label+')'+x+'[r'+relationships+']'+y+'('+( (this.cypher.to > 0) ? 'm' : '' )+')');
  }
  // guess return objects from start string if it's not set
  // e.g. START n = node(*), a = node(2) WHERE … RETURN (~>) n, a;
  if ((!query.return_properties)||((query.return_properties)&&(query.return_properties.length == 0)&&(query.start))) {
    var _start = ' '+query.start
    if (/ [a-zA-Z]+ \= /.test(_start)) {
      var matches = _start;
      query.return_properties = [];
      matches = matches.match(/[\s\,]([a-z]+) \= /g);
      for (var i = 0; i < matches.length; i++) {
        query.return_properties.push(matches[i].replace(/^[\s\,]*([a-z]+).*$/i,'$1'));
      }
      if ((this.neo4jrestful.version >= 2)&&(query.return_properties.length === 1)&&(query.return_properties[0] === 'n')) {
        // try adding labels if we have only n[node] as return propert
        query.return_properties.push('labels(n)');
      }
      query.return_properties = query.return_properties.join(', ');
    }
  }

  // Set a fallback to START n = node(*) 
  if ((!query.start)&&(!(query.match.length > 0))) {
    // query.start = 'n = node(*)';
    query.start = this.__type_identifier__+' = '+this.__type__+'(*)';
  }
  if ((!(query.match.length>0))&&(this.label)) {
    // e.g. ~> MATCH n:Person
    query.match.push(this.__type_identifier__+':'+this.label);
  }

  // rule(s) for findById
  if (query.by_id > 0) {
    var identifier = query.node_identifier || this.__type_identifier__;
    // put in where clause if `START n = node(*)` or no START statement exists
    if ( (!query.start) || (/^\s*n\s*\=\s*node\(\*\)\s*$/.test(query.start)) ) {
      // we have to use the id method for the special key `id`
      query.where.push("id("+identifier+") = "+query.by_id);
    }
  }
  return query;
}

Node.prototype.toCypherQuery = function() {
  var query = this._prepareQuery();
  var template = "";
  if (query.start)
    template += "START %(start)s ";
  if (query.match.length > 0)
    template += "MATCH %(match)s ";
    template += "%(With)s ";
    template += "%(where)s ";
  if (query.set)
    template += "SET %(set)s ";
    template += "%(action)s %(return_properties)s ";
  if (query.order_by)
    template += "ORDER BY %(order_by)s ";
  if (query.skip)
    template += "SKIP %(skip)s ";
  if (query.limit)
    template += "LIMIT %(limit)s";
    template += ";";

  var cypher = helpers.sprintf(template, {
    start:              query.start,
    from:               '',
    match:              (query.match.length > 0) ? query.match.join(' AND ') : '',
    With:               (query.With) ? query.With : '',
    action:             (query.action) ? query.action : 'RETURN'+((query._distinct) ? ' DISTINCT ' : ''),
    return_properties:  query.return_properties,
    where:              ((query.where)&&(query.where.length > 0)) ? 'WHERE '+query.where.join(' AND ') : '',
    set:                (query.set) ? query.set.join(', ') : '', 
    to:                 '',
    order_by:           (query.order_by) ? query.order_by+' '+query.order_direction : '',
    limit:              query.limit,
    skip:               query.skip  
  })
  cypher = cypher.trim().replace(/\s+;$/,';');
  return cypher;
}

Node.prototype._start_node_id = function(fallback) {
  if (typeof fallback === 'undefined')
    fallback = '*'
  if (this.cypher.from > 0)
    return this.cypher.from;
  if (this.cypher.by_id)
    return this.cypher.by_id;
  else
    return (this.hasId()) ? this.id : fallback; 
};

Node.prototype._end_node_id = function(fallback) {
  if (typeof fallback === 'undefined')
    fallback = '*'
  return (this.cypher.to > 0) ? this.cypher.to : fallback; 
};

Node.prototype.singletonForQuery = function(cypher) {
  var singleton = this.singleton()
  singleton.cypher = _.extend(singleton.cypher, cypher);
  return (this.hasId()) ? singleton.findById(this.id) : this;
}

Node.prototype.exec = function(cb, cypher_or_request) {
  var request = null;
  var cypherQuery = null;
  // you can alternatively use an url 
  if (typeof cypher_or_request === 'string')
    cypherQuery = cypher_or_request;
  else if (typeof cypher_or_request === 'object')
    request = _.extend({ type: 'get', data: {}, url: null }, cypher_or_request);
  
  if (typeof cb === 'function') {
    var cypher = this.toCypherQuery();
    // reset node, because it might be called from prototype
    // if we have only one return property, we resort this
    if ( (this.cypher.return_properties)&&(this.cypher.return_properties.length === 1) ) {
      if (cypherQuery)
        return this.query(cypherQuery, cb);
      else if (request)
        return this.query(request, cb);
      else
        // default, use the build cypher query
        return this.query(cypher, cb);
    } else {
      return this.query(cypher, cb);
    } 
  }
  return null;
}

Node.prototype.query = function(cypherQuery, options, cb) {
  var self = this;
  
  var DefaultConstructor = this.recommendConstructor();

  var _deliverResultset = function(self, cb, err, sortedData, debug) {
    if ( (self.cypher.by_id) && (self.cypher.return_properties.length === 1) && (self.cypher.return_properties[0] === 'n') && (sortedData[0]) )
      sortedData = sortedData[0];
    else if ( (self.cypher.limit === 1) && (sortedData.length === 1) )
      sortedData = sortedData[0];
    else if ( (self.cypher.limit === 1) && (sortedData.length === 0) )
      sortedData = null;
    // s.th. like [ 3 ] as result for instance
    if ( (_.isArray(sortedData)) && (sortedData.length === 1) && (typeof sortedData[0] !== 'object') )
      sortedData = sortedData[0];
    return cb(err, sortedData, debug);
  } 

  var _processData = function(err, result, debug, cb) {
    if ((err)||(!result)) {
      return cb(err, result, debug);
    } else {
      var sortedData = [];
      var errors = [];
      // we are using the 
      var sequence = Sequence.create();
      // we iterate through the results
      var data = (result.data) ? result.data : [ result ];
      // because we are making a seperate request we instanciate another client
      // var neo4jrestful = new Node.prototype.neo4jrestful.constructor(self.neo4jrestful.baseUrl);
      for (var x=0; x < data.length; x++) {
        if (typeof data[x][0] === 'undefined') {
          break;
        }
        var basicNode = self.neo4jrestful.createObjectFromResponseData(data[x][0], DefaultConstructor);
        (function(x,basicNode){
          sequence.then(function(next) {
            // TODO: reduce load / calls, currently it's way too slow…
            if (typeof basicNode.load === 'function') {
              basicNode.load(function(err, node) {
                if ((err) || (!node))
                  errors.push(err);
                sortedData[x] = node;
                next();
              });
            } else {
              // no load() function found
              sortedData[x] = basicNode;
              next();
            }
          });
        })(x, basicNode);
      }
      sequence.then(function(next){
        //finally
        if ( (data.data) && (data.data[0]) && (typeof data.data[0][0] !== 'object') )
          sortedData = data.data[0][0];
        return _deliverResultset(self, cb, (errors.length === 0) ? null : errors, sortedData, debug);
      });
    }
  }

  // sort arguments
  if (typeof options !== 'object') {
    cb = options;
    options = {};
  }
  if (this.label)
    options.label = this.label;

  if (typeof cypherQuery === 'string') {
    // check for stream flag
    // in stream case we use stream() instead of query()
    var query = null;
    if (this._stream_) {
      return this.neo4jrestful.stream(cypherQuery, options, function(data, debug) {
        var object = null;
        if ( (data) && (data.__type__) ) {
          cb(
            Node.singleton().neo4jrestful.createObjectFromResponseData(data._response, DefaultConstructor)
          );
        } else {
          return cb(data);
        }
      });
    }
    else {
      return this.neo4jrestful.query(cypherQuery, options, function(err, data, debug) {
        _processData(err, data, debug, cb);
      });
    }
  } else if (typeof cypherQuery === 'object') {
    // we expect a raw request object here
    // this is used to make get/post/put restful request
    // with the faeture of process node data
    var request = cypherQuery;
    if ( (!request.type) || (!request.data) || (!request.url) ) {
      return cb(Error("The 1st argument as request object must have the properties .url, .data and .type"), null);
    }
    return this.neo4jrestful[request.type](request.url, request.data, function(err, data, debug) {
      // transform to resultset
      data = {
        data: [ [ data ] ]
      };
      _processData(err, data, debug, cb);
    });
  } else {
    return cb(Error("First argument must be a string with the cypher query"), null);
  }
}

/*
 * Relationship methods
 */

Node.prototype.incomingRelationships = function(relation, cb) {
  var self = this.singletonForQuery();
  self._modified_query = true;
  if (typeof relation !== 'function') {
    self.cypher.relationship = relation;
  } else {
    cb = relation;
  }
  self.cypher.node_identifier = 'n';
  self.cypher.start = 'n = node('+self._start_node_id('*')+')';
  self.cypher.start += (self.cypher.to > 0) ? ', m = node('+self._end_node_id('*')+')' : ''
  self.cypher.incoming = true;
  self.cypher.outgoing = false;
  self.cypher.return_properties = ['r'];
  self.exec(cb);
  return self; // return self for chaining
}

Node.prototype.outgoingRelationships = function(relation, cb) {
  var self = this.singletonForQuery();
  self._modified_query = true;
  if (typeof relation !== 'function') {
    self.cypher.relationship = relation;
  } else {
    cb = relation;
  }
  self.cypher.node_identifier = 'n';
  self.cypher.start = 'n = node('+self._start_node_id('*')+')';
  self.cypher.start += (self.cypher.to > 0) ? ', m = node('+self._end_node_id('*')+')' : ''
  self.cypher.incoming = false;
  self.cypher.outgoing = true;
  self.cypher.return_properties = ['r'];
  self.exec(cb);
  return self; // return self for chaining
}

Node.prototype.incomingRelationshipsFrom = function(node, relation, cb) {
  var self = this.singletonForQuery();
  self._modified_query = true;
  self.cypher.from = self.id || null;
  self.cypher.to = helpers.getIdFromObject(node);
  if (typeof relation !== 'function')
    self.cypher.relationship = relation;
  self.cypher.return_properties = ['r'];
  return self.incomingRelationships(relation, cb);
}

Node.prototype.outgoingRelationshipsTo = function(node, relation, cb) {
  var self = this.singletonForQuery();
  self._modified_query = true;
  self.cypher.to = helpers.getIdFromObject(node);
  if (typeof relation !== 'function')
    self.cypher.relationship = relation;
  self.cypher.return_properties = ['r'];
  return self.outgoingRelationships(relation, cb);
}

Node.prototype.allDirections = function(relation, cb) {
  var self = this.singletonForQuery();
  self._modified_query = true;
  if (typeof relation !== 'function')
    self.cypher.relationship = relation;
  self.cypher.node_identifier = 'n';
  self.cypher.start = 'n = node('+self._start_node_id('*')+'), m = node('+self._end_node_id('*')+')';
  self.cypher.incoming = true;
  self.cypher.outgoing = true;
  self.cypher.return_properties = ['n', 'm', 'r'];
  self.exec(cb);
  return self; // return self for chaining
}

Node.prototype.relationshipsBetween = function(node, relation, cb) {
  var self = this.singletonForQuery();
  self._modified_query = true;
  self.cypher.to = helpers.getIdFromObject(node);
  if (typeof relation !== 'function')
    self.cypher.relationship = relation;
  self.cypher.return_properties = ['r'];
  self.exec(cb);
  return self.allDirections(relation, cb);
}

Node.prototype.allRelationships = function(relation, cb) {
  var self = this.singletonForQuery();
  var label = (this.cypher.label) ? ':'+this.cypher.label : '';
  if (typeof relation === 'string') {
    relation = ':'+relation;
  } else {
    cb = relation;
    relation = '';
  }
  self._modified_query = true;
  self.cypher.match.push('n'+label+'-[r'+relation+']-()');
  self.cypher.return_properties = ['r'];
  self.exec(cb);
  return self; // return self for chaining
}

Node.prototype.limit = function(limit, cb) {
  this._modified_query = true;
  this.cypher.limit = Number(limit);
  if (this.cypher.action === 'DELETE')
    throw Error("You can't use a limit on a DELETE, use WHERE instead to specify your limit");
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.skip = function(skip, cb) {
  this._modified_query = true;
  this.cypher.skip = Number(skip);
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.distinct = function(cb) {
  this._modified_query = true;
  this.cypher._distinct = true;
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.orderBy = function(property, cb, identifier) {
  this._modified_query = true;
  var direction = '';
  if (typeof property === 'object') {
    var key = Object.keys(property)[0];
    cb = direction;
    direction = property[key];
    property = key;
    if ( (typeof direction === 'string') && ((/^(ASC|DESC)$/i).test(direction)) ) {
      this.cypher.order_direction = direction;
    }
  } else if (typeof property === 'string') {
    // custom statement, no process at all
    // we use 1:1 the string
    this.cypher.order_by = property;
  } else if (typeof cb === 'string') {
    identifier = cb;
    cb = null;
  }
  if (typeof identifier === 'undefined')
    identifier = this.__type_identifier__;
  if ((typeof identifier === 'string') && (/^[nmr]$/i.test(identifier))) {
    if (identifier === 'n') this.whereNodeHasProperty(property);
    if (identifier === 'm') this.whereEndNodeHasProperty(property);
    if (identifier === 'r') this.whereRelationshipHasProperty(property);
  } else {
    identifier = null;
  }

  if (identifier) {
    // s.th. like ORDER BY n.`name` ASC
    // escape property
    this.cypher.order_by = identifier + ".`"+property+"`";
  } else {
    // s.th. like ORDER BY n.name ASC
    this.cypher.order_by = property;
  }
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.orderNodeBy = function(property, direction, cb) {
  return this.orderBy(property, direction, cb, 'n');
}

Node.prototype.orderStartNodeBy = function(property, direction, cb) {
  return this.orderNodeBy(property, direction, cb);
}

Node.prototype.orderEndNodeBy = function(property, direction, cb) {
  return this.orderBy(property, direction, cb, 'm');
}

Node.prototype.orderRelationshipBy = function(property, direction, cb) {
  return this.orderBy(property, direction, cb, 'r');
}

Node.prototype.match = function(string, cb) {
  this.cypher.match.push(string);
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.where = function(where, cb) {
  this._modified_query = true;
  this.cypher.where = [];
  return this.andWhere(where, cb);
}

Node.prototype.andWhere = function(where, cb, _options) {
  this._modified_query = true;
  if (_.isObject(where)) {
    if (Object.keys(where).length === 0) {
      // return here
      this.exec(cb);
      return this;
    }
    if (!_.isArray(where))
      where = [ where ];
  }
  var attributes = helpers.extractAttributesFromCondition(_.extend(where));
  for (var i = 0; i < attributes.length; i++) {
    this.whereHasProperty(attributes[i]);
  }
  if (typeof _options === 'undefined')
    _options = {};
  if (typeof _options.identifier !== 'string')
    // good or bad idea that we use by default n as identifier?
    _options.identifier = 'n';
  this.cypher.where.push(helpers.conditionalParameterToString(_.extend(where),undefined,_options));
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.whereStartNode = function(where, cb) {
  this.cypher.where = [];
  return this.andWhere(where, cb, { identifier: 'n' });
}

Node.prototype.whereEndNode = function(where, cb) {
  this.cypher.where = [];
  return this.andWhere(where, cb, { identifier: 'm' });
}

Node.prototype.whereNode = function(where, cb) {
  this.cypher.where = [];
  return this.andWhere(where, cb, { identifier: 'n' });
}

Node.prototype.whereRelationship = function(where, cb) {
  this.cypher.where = [];
  return this.andWhere(where, cb, { identifier: 'r' });
}

Node.prototype.andWhereStartNode = function(where, cb) {
  return this.andWhere(where, cb, {identifier: 'n' });
}

Node.prototype.andWhereEndNode = function(where, cb) {
  return this.andWhere(where, cb, { identifier: 'm' });
}

Node.prototype.andWhereNode = function(where, cb) {
  return this.andWhere(where, cb, { identifier: 'n' });
}

Node.prototype.andWereRelationship = function(where, cb) {
  return this.andWhere(where, cb, { identifier: 'r' });
}

Node.prototype.whereHasProperty = function(property, identifier, cb) {
  if (_.isFunction(identifier)) {
    cb = identifier;
    identifier = null;
  }
  this._modified_query = true;
  if (typeof property !== 'string') {
    // we need a property to proceed
    return cb(Error('Property name is mandatory.'),null);
  }
  if (/^[nmr]\./.test(property))
    // remove identifier
    property = property.replace(/^[nmr]\./,'')
  // if NOT default to true/false, no property condition is needed
  if (!/[\!\?]$/.test(property)) {
    if (this.cypher.return_properties.length === 0) {
      this.findAll();
    }
    // no identifier found, guessing from return properties
    if (typeof identifier !== 'string')
      identifier = this.cypher.return_properties[this.cypher.return_properties.length-1];
    this.andWhere('HAS ('+identifier+'.`'+property+'`)');
  }
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.whereNodeHasProperty = function(property, cb) {
  return this.whereHasProperty(property, 'n', cb);
}

Node.prototype.whereStartNodeHasProperty = function(property, cb) {
  return this.whereHasProperty(property, 'n', cb);
}

Node.prototype.whereEndNodeHasProperty = function(property, cb) {
  return this.whereHasProperty(property, 'm', cb);
}

Node.prototype.whereRelationshipHasProperty = function(property, cb) {
  return this.whereHasProperty(property, 'r', cb);
}

Node.prototype.delete = function(cb) {
  if (this.hasId())
    return cb(Error('To delete a node, use remove(). delete() is for queries'),null);
  this._modified_query = true;
  this.cypher.action = 'DELETE';
  if (this.cypher.limit)
    throw Error("You can't use a limit on a DELETE, use WHERE instead to specify your limit");
  this.exec(cb);
  return this; // return self for chaining
}

Node.prototype.deleteIncludingRelationships = function(cb) {
  var label = (this.label) ? ":"+this.label : "";
  if (!this.cypher.start)
    this.cypher.start = this.__type_identifier__ + " = " + this.__type__+"(*)";
  this.cypher.match.push([ this.__type_identifier__+label+"-[r?]-()" ]);
  this.cypher.return_properties = [ "n", "r" ];
  return this.delete(cb);
}

Node.prototype.remove = function(cb) {
  var self = this;
  this.onBeforeRemove(function(err) {
    if (self.is_singleton)
      return cb(Error("To delete results of a query use delete(). remove() is for removing an instanced "+this.__type__),null);
    if (self.hasId()) {
      return self.neo4jrestful.delete('/db/data/'+self.__type__+'/'+self.id, cb);
    }
  })
  return this;
}

Node.prototype.onBeforeRemove = function(next) { next(null,null); }

Node.prototype.removeWithRelationships = function(cb) {
  var self = this;
  return this.removeAllRelationships(function(err) {
    if (err)
      return cb(err, null);
    // remove now node
    return self.remove(cb);
  });
}

// Node.prototype.removeRelationshipsFrom = function() { }
// Node.prototype.removeRelationshipsTo = function() { }
// Node.prototype.removeRelationshipsBetween = function() {}
Node.prototype.removeOutgoinRelationships = function(type, cb) {
  return this.removeRelationships(type, cb, { direction: '->' });
}
Node.prototype.removeIncomingRelationships = function(type, cb) {
  return this.removeRelationships(type, cb, { direction: '<-' });
}

Node.prototype.removeAllRelationships = function(cb) {
  return this.removeRelationships('', cb);
}
Node.prototype.removeRelationships = function(type, cb, _options) {
  if (typeof type === 'function') {
    _options = cb;
    cb = type;
    type = null;
  }
  var defaultOptions = {
    direction: 'all', // incoming / outgoing
    type: type,
    endNodeId: null
  };
  if (typeof _options === 'undefined') {
    _options = _.extend({},defaultOptions);
  } else {
    _options = _.extend({},defaultOptions,_options);
  }
  if ((this.hasId())&&(typeof cb === 'function')) {
    var direction = _options.direction;
    if ( (!(direction === 'incoming')) || (!(direction === 'outgoing')) )
      direction = 'all';
    return Node.prototype.findById(this.id)[direction+'Relationships']().delete(cb);
  } else {
    return cb(Error("You can remove relationships only from an instanced node /w a valid cb"), null);
  }
}

Node.prototype.createRelationship = function(options, cb) {
  var self = this;
  options = _.extend({
    from_id: this.id,
    to_id: null,
    type: null,
    // unique: false ,// TODO: implement!
    properties: null,
    distinct: null
  }, options);
  if (options.properties)
    options.properties = helpers.flattenObject(options.properties);

  var _create_relationship_by_options = function(options) {
    return self.neo4jrestful.post('/db/data/node/'+options.from_id+'/relationships', {
      data: {
        to: new Node({},options.to_id).uri,
        type: options.type,
        data: options.properties
      }
    }, function(err, relationship) {
      // to execute the hooks we manually perform the save method
      // TODO: make a static method in relationships, s.th. create_between_nodes(startId, endId, data)
      if (err)
        return cb(err, relationship);
      else {
        relationship.save(cb);
      }
    });
  }

  if ((_.isNumber(options.from_id))&&(_.isNumber(options.to_id))&&(typeof cb === 'function')) {
    if (options.distinct) {
      Node.findById(options.from_id).outgoingRelationshipsTo(options.to_id, options.type, function(err, result) {
        if (err)
          return cb(err, result);
        if (result.length === 1) {
          // if we have only one relationship, we update this one
          Relationship.findById(result[0].id, function(err, relationship){
            if (relationship) {
              if (options.properties)
                relationship.data = options.properties;
              relationship.save(cb);
            } else {
              cb(err, relationship);
            }
          })
        } else {
          // we create a new one
          return _create_relationship_by_options(options);
        }
      });
    } else {
      // create relationship
      return _create_relationship_by_options(options);
    }
  } else {
    cb(Error('Missing from_id('+options.from_id+') or to_id('+options.to_id+') OR no cb attached'), null);
  }
}

Node.prototype.createRelationshipBetween = function(node, type, properties, cb, options) {
  if (typeof options !== 'object') options = {};
  var self = this;
  if (typeof properties === 'function') {
    cb = properties;
    properties = {};
  }
  if ((this.hasId())&&(helpers.getIdFromObject(node))) {
    // to avoid deadlocks
    // we have to create the relationships sequentially
    self.createRelationshipTo(node, type, properties, function(err, resultFirst, debug_a){
      self.createRelationshipFrom(node, type, properties, function(secondErr, resultSecond, debug_b) {
        if ((err)||(secondErr)) {
          if ((err)&&(secondErr))
            cb([err, secondErr], null, [ debug_a, debug_b ]);
          else
            cb(err || secondErr, null, [ debug_a, debug_b ]);
        } else {
          cb(null, [ resultFirst, resultSecond ], debug_a || debug_b);
        }
      }, options);
    }, options);
  } else {
    cb(Error("You need two instanced nodes as start and end point"), null);
  }
  
}

Node.prototype.createRelationshipTo = function(node, type, properties, cb, options) {
  if (typeof options !== 'object') options = {};
  var args;
  var id = helpers.getIdFromObject(node);
  ( ( args = helpers.sortOptionsAndCallbackArguments(properties, cb) ) && ( properties = args.options ) && ( cb = args.callback ) );
  options = _.extend({
    properties: properties,
    to_id: id,
    type: type
  }, options);
  return this.createRelationship(options, cb);
}

Node.prototype.createRelationshipFrom = function(node, type, properties, cb, options) {
  if (typeof options !== 'object') options = {};
  var args;
  var id = helpers.getIdFromObject(node);
  ( ( args = helpers.sortOptionsAndCallbackArguments(properties, cb) ) && ( properties = args.options ) && ( cb = args.callback ) );
  options = _.extend({
    properties: properties,
    from_id: id,
    to_id: this.id,
    type: type
  }, options);
  return this.createRelationship(options, cb);
}

Node.prototype.createOrUpdateRelationship = function(options, cb) {
  if (typeof options !== 'object') options = {};
  options.distinct = true;
  return this.createRelationship(options, cb);
}

Node.prototype.createOrUpdateRelationshipTo = function(node, type, properties, cb, options) {
  if (typeof options !== 'object') options = {};
  options.distinct = true;
  return this.createRelationshipTo(node, type, properties, cb, options);
}

Node.prototype.createOrUpdateRelationshipFrom = function(node, type, properties, cb, options) {
  if (typeof options !== 'object') options = {};
  options.distinct = true;
  return this.createRelationshipFrom(node, type, properties, cb, options);
}

Node.prototype.createOrUpdateRelationshipBetween = function(node, type, properties, cb, options) {
  if (typeof options !== 'object') options = {};
  options.distinct = true;
  return this.createRelationshipBetween(node, type, properties, cb, options);
}

Node.prototype.recommendConstructor = function(Fallback) {
  if (typeof Fallback !== 'function')
    Fallback = this.constructor;
  var label = (this.label) ? this.label : ( ((this.labels)&&(this.labels.length===1)) ? this.labels[0] : null );
  return (label) ? Node.registered_model(label) || Fallback : Fallback;
}

/*
 * Label methods
 */

Node.prototype.requestLabels = function(cb) {
  if ((this.hasId())&&(typeof cb === 'function')) {
    this.neo4jrestful.get('/db/data/node/'+this.id+'/labels', cb);
  }
  return this;
}

Node.prototype.setLabels = function(labels) {
  if (_.isArray(labels)) {
    this.labels = _.clone(labels);
  }
  // if we have only one label we set this to default label
  if ((_.isArray(this.labels))&&(this.labels.length === 1)) {
    this.label = this.labels[0];
  }
  return this.labels;
}

Node.prototype.labelsAsArray = function() {
  var labels = this.labels;
  if (!_.isArray(labels))
    labels = [];
  if (this.label)
    labels.push(this.label);
  return _.uniq(labels);
}

Node.prototype.allLabels = function(cb) {
  if ( (this.hasId()) && (_.isFunction(cb)) ) {
    return this.neo4jrestful.get('/db/data/node/'+this.id+'/labels', cb);
  }
}

Node.prototype.createLabel = function(label, cb) {
  return this.createLabels([ label ], cb);
}

Node.prototype.createLabels = function(labels, cb) {
  if ( (this.hasId()) && (_.isFunction(cb)) )
    return this.neo4jrestful.post('/db/data/node/'+this.id+'/labels', { data: labels }, cb);
}

Node.prototype.addLabels = function(labels, cb) {
  var self = this;
  if ( (this.hasId()) && (_.isFunction(cb)) ) {
    if (!_.isArray(labels))
      labels = [ labels ];
    self.allLabels(function(err, storedLabels) {
      if (!_.isArray(storedLabels))
        storedLabels = [];
      storedLabels.push(labels);
      storedLabels = _.uniq(_.flatten(storedLabels));
      self.replaceLabels(storedLabels, cb);
    });
  } else {
    // otherwise it can be used as a setter
    this.labels = labels;
    if (labels.length===1)
      this.label = labels[0];
  }
  return this;
}

Node.prototype.addLabel = function(label, cb) {
  return this.addLabels([ label ], cb);
}

Node.prototype.replaceLabels = function(labels, cb) {
  if ( (this.hasId()) && (_.isFunction(cb)) ) {
    if (!_.isArray(labels))
      labels = [ labels ];
    return this.neo4jrestful.put('/db/data/node/'+this.id+'/labels', { data: labels }, cb);
  }
}

Node.prototype.removeLabels = function(cb) {
  if ( (this.hasId()) && (_.isFunction(cb)) ) {
    return this.neo4jrestful.delete('/db/data/node/'+this.id+'/labels', cb);
  }
}

// Node.prototype.replaceLabel = function

// TODO: autoindex? http://docs.neo4j.org/chunked/milestone/rest-api-configurable-auto-indexes.html
Node.prototype.addIndex = function(namespace, key, value, cb) {
  if (this.is_singleton)
    return cb(Error('Singleton instance is not allowed to get persist.'), null);
  this._modified_query = false;
  if ( (!namespace) || (!key) || (!value) || (!_.isFunction(cb)) )
    throw Error('namespace, key and value arguments are mandatory for indexing.');
  if (!this.hasId())
    return cb(Error('You need to persist the node before you can index it.'),null);
  if (typeof cb === 'function')
    return this.neo4jrestful.post('/db/data/index/'+this.__type__+'/'+namespace, { data: { key: key, value: value, uri: this.uri } }, cb);
  else
    return null;
  return keys;
}

Node.prototype.toObject = function() {
  var o = {
    id: this.id,
    data: _.extend(this.data),
    uri: this.uri
  };
  if (this.label)
    o.label = this.label;
  return o;
}

/*
 * Request methods
 */

Node.prototype.stream = function(cb) {
  this._stream_ = true;
  this.exec(cb);
  return this;
}

Node.prototype.each = function(cb) {
  return this.stream(cb);
}

/*
 * STATIC METHODS for `find` Queries
 */ 

Node.prototype.find = function(where, cb) {
  var self = this;
  if (!self.is_singleton)
    self = this.singleton(undefined, this);
  self._modified_query = true;
  if (self.label) self.withLabel(self.label);
  if ((typeof where === 'string')||(typeof where === 'object')) {
    self.where(where);
    if (!self.cypher.start) {
      self.cypher.start = self.__type_identifier__+' = '+self.__type__+'('+self._start_node_id('*')+')';
    }
    self.exec(cb);
    return self;
  } else {
    return self.findAll(cb);
  }
}

Node.prototype.findOne = function(where, cb) {
  var self = this;
  if (typeof where === 'function') {
    cb = where;
    where = undefined;
  }

  self = this.find(where);
  self.cypher.limit = 1;
  self.exec(cb);
  return self;
}

Node.prototype.findById = function(id, cb) {
  var self = this;
  if (!self.is_singleton)
    self = this.singleton(undefined, this);
  if ( (_.isNumber(Number(id))) && (typeof cb === 'function') ) {
    // to reduce calls we'll make a specific restful request for one node
    return self.neo4jrestful.get('/db/data/'+this.__type__+'/'+id, function(err, node) {
      if ((node) && (typeof self.load === 'function')) {
        //  && (typeof node.load === 'function')     
        node.load(cb);
      } else {
        cb(err, node);
      }
    });
  } else {
    self.cypher.by_id = Number(id);
    return self.findByUniqueKeyValue('id', id, cb);
  } 
}

Node.prototype.findByUniqueKeyValue = function(key, value, cb) {
  var self = this;
  if (!self.is_singleton)
    self = this.singleton(undefined, this);
  // we have s.th. like
  // { key: value }
  if (typeof key === 'object') {
    cb = value;
    var _key = Object.keys(key)[0];
    value = key[_key];
    key = _key;
  }

  if (typeof key !== 'string')
    key = 'id';
  if ( (_.isString(key)) && (typeof value !== 'undefined') ) {
    var identifier = self.cypher.node_identifier || self.__type_identifier__;
    if (self.cypher.return_properties.length === 0)
      self.cypher.return_properties = [ identifier ];
    if (key !== 'id') {
      var query = {};
      query[key] = value;
      self.where(query);
      if (self.label) self.withLabel(self.label);
      // if we have an id: value, we will build the query in prepareQuery
    }
    if (typeof cb === 'function') {
       self.exec(function(err,found){
        if (err)
          return cb(err, found);
        else {
          // try to return the first
          found = (found.length === 0) ? null : ((found)&&(found[0])) ? found[0] : found;
          return cb(null, found);
        }
       });
    }
   
  }
  return self;
}

// Node.prototype.findUnique = function(key, value, cb) { }
// Node.prototype.findUniqueWithLabel = function(label, key, value) {}

Node.prototype.findAll = function(cb) {
  var self = this;
  if (!self.is_singleton)
    self = this.singleton(undefined, this);
  self._modified_query = true;
  self.cypher.limit = null;
  self.cypher.return_properties = ['n'];
  if (self.label) self.withLabel(self.label);
  self.exec(cb);
  return self;
}

Node.prototype.findByIndex = function(namespace, key, value, cb) {
  var self = this;
  if (!self.is_singleton)
    self = this.singleton(undefined, this);
  var values = {};
  if ((namespace)&&(key)&&(value)&&(typeof cb === 'function')) {
    // values = { key: value };
    // TODO: implement
    return self.neo4jrestful.get('/db/data/index/'+this.__type__+'/'+namespace+'/'+key+'/'+value+'/', function(err, result, debug) {
      if (err) {
        cb(err, result, debug);
      } else {
        result = (result[0]) ? result[0] : null;
        cb(null, result, debug);
      }
    });
  } else {
    return cb(Error('Namespace, key, value and mandatory to find indexed nodes.'), null);
  }
}

Node.prototype.findOrCreate = function(where, cb) {
  var self = this;
  this.find(where).count(function(err, count, debug) {
    if (err)
      return cb(err, count, debug);
    else {
      if (count === 1)
        return self.findOne(where, cb);
      else if (count > 1)
        return cb(Error("More than one node found… You have query one distinct result"), null);
      // else
      var node = new self.constructor(where);
      node.save(cb);  
    }
  });
}

/*
 * Static methods (misc)
 */

Node.prototype.copy_of = function(that) {
  return _.extend({},that);
}

/*
 * Singleton methods, shorthands for their corresponding (static) prototype methods
 */

// TODO: maybe better to replace manual argument passing with .apply method?!

Node.singleton = function(id, label) {
  return this.prototype.singleton(id, label);
}

Node.find = function(where, cb) {
  return this.prototype.find(where, cb);
}

Node.findAll = function(cb) {
  return this.prototype.findAll(cb);
}
Node.findByIndex = function(namespace, key, value, cb) {
  return this.prototype.findByIndex(namespace, key, value, cb);
}

Node.findByUniqueKeyValue = function(key, value, cb) {
  return this.prototype.findByUniqueKeyValue(key, value, cb);
}

Node.findById = function(id, cb) {
  return this.prototype.findById(id, cb);
}

Node.findOne = function(where, cb) {
  return this.prototype.findOne(where, cb);
}

Node.find = function(where, cb) {
  return this.prototype.find(where, cb);
}

Node.findOrCreate = function(where, cb) {
  return this.prototype.findOrCreate(where, cb);
}

Node.query = function(cypherQuery, options, cb) {
  return this.prototype.singleton().query(cypherQuery, options, cb);
}

Node.register_model = function(Class, label, cb) {
  var name = helpers.constructorNameOfFunction(Class);
  if (typeof label === 'string') {
    name = label; 
  } else {
    cb = label;
  }
  Node.__models__[name] = Class;
  Class.prototype.initialize(cb);
  return Class;
}

Node.unregister_model = function(Class) {
  var name = (typeof Class === 'string') ? Class : helpers.constructorNameOfFunction(Class);
  if (typeof Node.__models__[name] === 'function')
    delete Node.__models__[name];
  return Node.__models__;
}

Node.registered_models = function() {
  return Node.__models__;
}

Node.registered_model = function(model) {
  if (typeof model === 'function') {
    model = helpers.constructorNameOfFunction(model);
  }
  return Node.registered_models()[model] || null;
}

Node.convert_node_to_model = function(node, model, fallbackModel) {
  return this.prototype.convert_node_to_model(node, model, fallbackModel);
}

Node.ensureIndex = function(cb) {
  return this.singleton().ensureIndex(cb);
}

Node.dropIndex = function(fields, cb) {
  return this.singleton().dropIndex(fields, cb);
}

Node.dropEntireIndex = function(cb) {
  return this.singleton().dropEntireIndex(cb);
}

Node.getIndex = function(cb) {
  return this.singleton().getIndex(cb);
}

var initNode = function(neo4jrestful) {

  // we can only check for object type,
  // better would be to check for constructor neo4jrestful
  if (typeof neo4jrestful === 'object') {
    if (typeof window === 'object') {
      window.Neo4jMapper.Node.prototype.neo4jrestful = neo4jrestful;
      return window.Neo4jMapper.Node;
    }
    else {
      Node.prototype.neo4jrestful = neo4jrestful;
      return Node;
    }
  }    

  return Node;

}

if (typeof window !== 'object') {
  module.exports = exports = initNode;
} else {
  window.Neo4jMapper.Node = Node;
}