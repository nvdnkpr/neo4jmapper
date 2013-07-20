// Generated by CoffeeScript 1.6.3
var Graph, Join, Neo4j, Node, client, configForTest, expect, helpers, neo4jmapper, _, _ref, _trim,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

if (typeof root !== "undefined" && root !== null) {
  require('source-map-support').install();
  expect = require('expect.js');
  Join = require('join');
  _ = require('underscore');
  configForTest = require('./config');
  Neo4j = require("../" + configForTest.srcFolder + "/index.js");
  _ref = new Neo4j(configForTest.neo4jURL), Graph = _ref.Graph, Node = _ref.Node, helpers = _ref.helpers, client = _ref.client;
} else if (typeof window !== "undefined" && window !== null) {
  configForTest = _.extend({
    doLog: false,
    wipeDatabase: false,
    neo4jURL: 'http://yourserver:0000/',
    startInstantly: false
  }, configForTest || {});
  Join = window.Join;
  neo4jmapper = Neo4jMapper.init(configForTest.neo4jURL);
  Graph = neo4jmapper.Graph, Node = neo4jmapper.Node, helpers = neo4jmapper.helpers, client = neo4jmapper.client;
  Neo4j = Neo4jMapper.init;
}

if (configForTest.doLog) {
  client.constructor.prototype.log = Graph.prototype.log = configForTest.doLog;
}

_trim = function(s) {
  return s.trim().replace(/\s+/g, ' ');
};

describe('Neo4jMapper (cypher queries)', function() {
  it('expect to throw an error on some specific chaining cases', function() {
    var e, err;
    err = null;
    try {
      Node.findOne().deleteIncludingRelationships(function() {});
    } catch (_error) {
      e = _error;
      err = e;
    }
    expect(err).not.to.be(null);
    err = null;
    try {
      Node.find().deleteIncludingRelationships().limit(1, function() {});
    } catch (_error) {
      e = _error;
      err = e;
    }
    return expect(err).not.to.be(null);
  });
  return it('expect to build various kind of queries', function() {
    var Actor, functionCall, map, node, query, results, todo, _ref1, _results;
    Actor = (function(_super) {
      __extends(Actor, _super);

      function Actor() {
        _ref1 = Actor.__super__.constructor.apply(this, arguments);
        return _ref1;
      }

      return Actor;

    })(Node);
    Node.register_model(Actor);
    node = new Node();
    results = [];
    map = {
      "Node::findAll()": [Node.prototype.findAll(), 'START n = node(*) RETURN n;'],
      "Node::findById(123)": [Node.prototype.findById(123), "START n = node(*) WHERE id(n) = 123 RETURN n;"],
      'Node::findOne()': [Node.prototype.findOne(), 'START n = node(*) RETURN n LIMIT 1;'],
      "Node::findAll().limit(10)": [Node.prototype.findAll().limit(10), 'START n = node(*) RETURN n LIMIT 10;'],
      "Node::findAll().match('n:Person')": [Node.prototype.findAll().match('n:Person'), "MATCH n:Person RETURN n;"],
      "Actor::findAll()": [Actor.prototype.findAll(), "START n = node(*) MATCH n:Actor RETURN n;"],
      "Node::findAll().skip(5)": [Node.prototype.findAll().skip(5), 'START n = node(*) RETURN n SKIP 5;'],
      "Node::findAll().orderBy( { 'name': 'DESC' } )": [
        Node.prototype.findAll().orderBy({
          'name': 'DESC'
        }), 'START n = node(*) WHERE ( HAS (n.`name`) ) RETURN n ORDER BY n.`name` DESC;'
      ],
      "Node::findAll().orderNodeBy({'name': 'ASC'})": [
        Node.prototype.findAll().orderNodeBy({
          'name': 'ASC'
        }), 'START n = node(*) WHERE ( HAS (n.`name`) ) RETURN n ORDER BY n.`name` ASC;'
      ],
      'Node::findAll().incomingRelationships()': [Node.prototype.findAll().incomingRelationships(), 'START n = node(*) MATCH (n)<-[r]-() RETURN r;'],
      'Actor::findAll().incomingRelationships()': [Actor.prototype.findAll().incomingRelationships(), 'START n = node(*) MATCH (n:Actor)<-[r]-() RETURN r;'],
      'Node::findAll().outgoingRelationships()': [Node.prototype.findAll().outgoingRelationships(), 'START n = node(*) MATCH (n)-[r]->() RETURN r;'],
      "Node::findAll().incomingRelationships()": [Node.prototype.findAll().incomingRelationships(), 'START n = node(*) MATCH (n)<-[r]-() RETURN r;'],
      "Node::findOne().outgoingRelationships(['know','like'])": [Node.prototype.findOne().outgoingRelationships(['know', 'like']), 'START n = node(*) MATCH (n)-[r:know|like]->() RETURN r LIMIT 1;'],
      "Node::findOne().outgoingRelationshipsTo(2, ['know','like'])": [Node.prototype.findOne().outgoingRelationshipsTo(2, ['know', 'like']), 'START n = node(*), m = node(2) MATCH (n)-[r:know|like]->(m) RETURN r LIMIT 1;'],
      "Node::findOne().where({ 'name?': 'Alice'})": [
        Node.prototype.findOne().where({
          'name?': 'Alice'
        }), "START n = node(*) WHERE ( n.`name`? = 'Alice' ) RETURN n LIMIT 1;"
      ],
      "Node::findOne().where({name: 'Alice'}).outgoingRelationships()": [
        Node.prototype.findOne().where({
          name: 'Alice'
        }).outgoingRelationships(), "START n = node(*) MATCH (n)-[r]->()  WHERE ( HAS (n.`name`) ) AND ( n.`name` = 'Alice' ) RETURN r LIMIT 1;"
      ],
      "Node::findAll().outgoingRelationships('know').distinct().count()": [Node.prototype.findAll().outgoingRelationships('know').distinct().count(), 'START n = node(*) MATCH (n)-[r:know]->() RETURN COUNT(DISTINCT *);'],
      "Node::singleton(1).incomingRelationshipsFrom(2, 'like').where({ 'r.since': 'years' })": [
        Node.prototype.singleton(1).incomingRelationshipsFrom(2, 'like').where({
          'r.since': 'years'
        }), "START n = node(1), m = node(2) MATCH (n)<-[r:like]-(m) WHERE ( HAS (r.`since`) ) AND ( r.since = 'years' ) RETURN r;"
      ],
      "Node::singleton(1).incomingRelationshipsFrom(2, 'like').whereRelationship({ 'since': 'years' })": [
        Node.prototype.singleton(1).incomingRelationshipsFrom(2, 'like').whereRelationship({
          'since': 'years'
        }), "START n = node(1), m = node(2) MATCH (n)<-[r:like]-(m) WHERE ( HAS (r.`since`) ) AND ( r.`since` = 'years' ) RETURN r;"
      ],
      "Node::find().whereNode({ 'boolean_a': true, 'boolean_b': false, 'string_a': 'true', 'number_a': 123.2, 'number_b': 123, 'string_b': '123', 'regex': /[a-z]/ })": [
        Node.prototype.find().whereNode({
          'boolean_a': true,
          'boolean_b': false,
          'string_a': 'true',
          'number_a': 123.2,
          'number_b': 123,
          'string_b': '123',
          'regex': /[a-z]/
        }), "START n = node(*) WHERE ( HAS (n.`boolean_a`) ) AND ( HAS (n.`boolean_b`) ) AND ( HAS (n.`string_a`) ) AND ( HAS (n.`number_a`) ) AND ( HAS (n.`number_b`) ) AND ( HAS (n.`string_b`) ) AND ( HAS (n.`regex`) ) AND ( n.`boolean_a` = true AND n.`boolean_b` = false AND n.`string_a` = 'true' AND n.`number_a` = 123.2 AND n.`number_b` = 123 AND n.`string_b` = '123' AND n.`regex` =~ '[a-z]' ) RETURN n;"
      ],
      "Node::find().where( { $or : [ { 'n.name': /alice/i } , { 'n.name': /bob/i } ] }).skip(2).limit(10).orderBy({ name: 'DESC'})": [
        Node.prototype.find().where({
          $or: [
            {
              'n.name': /alice/i
            }, {
              'n.name': /bob/i
            }
          ]
        }).skip(2).limit(10).orderBy({
          name: 'DESC'
        }), "START n = node(*) WHERE ( HAS (n.`name`) ) AND ( ( n.name =~ '(?i)alice' OR n.name =~ '(?i)bob' ) ) AND ( HAS (n.`name`) ) RETURN n ORDER BY n.`name` DESC SKIP 2 LIMIT 10;"
      ],
      "Actor::find().where( { $or : [ { 'n.name': /alice/i } , { 'n.name': /bob/i } ] }).skip(2).limit(10).orderBy({ name: 'DESC'})": [
        Actor.prototype.find().where({
          $or: [
            {
              'n.name': /alice/i
            }, {
              'n.name': /bob/i
            }
          ]
        }).skip(2).limit(10).orderBy({
          name: 'DESC'
        }), "START n = node(*) MATCH n:Actor WHERE ( HAS (n.`name`) ) AND ( ( n.name =~ '(?i)alice' OR n.name =~ '(?i)bob' ) ) AND ( HAS (n.`name`) ) RETURN n ORDER BY n.`name` DESC SKIP 2 LIMIT 10;"
      ],
      "Node::findOne().whereHasProperty('name').andWhere({ 'n.city': 'berlin' }": [
        Node.prototype.findOne().whereHasProperty('name').andWhere({
          'n.city': 'berlin'
        }), "START n = node(*) WHERE ( HAS (n.`name`) ) AND ( HAS (n.`city`) ) AND ( n.city = 'berlin' ) RETURN n LIMIT 1;"
      ],
      "Node::findOne().whereHasProperty('name').andWhere('name').andWhere([ { 'n.city': 'berlin' } , $and: [ { 'n.name': 'peter' }, $not: [ { 'n.name': 'pedro' } ] ] ])": [
        Node.prototype.findOne().whereHasProperty('name').andWhere([
          {
            'n.city': 'berlin'
          }, {
            $and: [
              {
                'n.name': 'peter'
              }, {
                $not: [
                  {
                    'n.name': 'pedro'
                  }
                ]
              }
            ]
          }
        ]), "START n = node(*) WHERE ( HAS (n.`name`) ) AND ( HAS (n.`city`) ) AND ( HAS (n.`name`) ) AND ( n.city = 'berlin' AND ( n.name = 'peter' AND NOT ( n.name = 'pedro' ) ) ) RETURN n LIMIT 1;"
      ],
      "Node::findOne().whereNode([ { 'city': 'berlin' } , $and: [ { 'name': 'peter' }, $not: [ { 'name': 'pedro' } ] ] ])": [
        Node.prototype.findOne().where([
          {
            'city': 'berlin'
          }, {
            $and: [
              {
                'name': 'peter'
              }, {
                $not: [
                  {
                    'name': 'pedro'
                  }
                ]
              }
            ]
          }
        ]), "START n = node(*) WHERE ( HAS (n.`city`) ) AND ( HAS (n.`name`) ) AND ( n.`city` = 'berlin' AND ( n.`name` = 'peter' AND NOT ( n.`name` = 'pedro' ) ) ) RETURN n LIMIT 1;"
      ],
      "Node::findById(123).incomingRelationships().delete().toCypherQuery()": [Node.prototype.findById(123).incomingRelationships()["delete"](), "START n = node(123) MATCH (n)<-[r]-() DELETE r;"],
      "Node::findById(123).allRelationships().delete()": [Node.prototype.findById(123).allRelationships()["delete"](), "MATCH n-[r]-() WHERE id(n) = 123 DELETE r;"],
      "Node.find().deleteIncludingRelationships()": [Node.find().deleteIncludingRelationships(), "START n = node(*) MATCH n-[r?]-() DELETE n, r;"],
      "Actor.findById(123).deleteIncludingRelationships()": [Actor.find().deleteIncludingRelationships(), "START n = node(*) MATCH n:Actor-[r?]-() DELETE n, r;"],
      "Node.findById(123).update({ name: 'Alice' })": [
        Node.findById(123).update({
          'name': 'Alice'
        }), "START n = node(*) WHERE id(n) = 123 SET n.`name` = 'Alice' RETURN n;"
      ],
      "Node.findById(123).update({ 'name': 'Alice', 'age': 20 })": [
        Node.findById(123).update({
          'name': 'Alice',
          'age': 20
        }), "START n = node(*) WHERE id(n) = 123 SET n.`name` = 'Alice', n.`age` = 20 RETURN n;"
      ]
    };
    _results = [];
    for (functionCall in map) {
      todo = map[functionCall];
      if ((todo != null ? todo[2] : void 0) === null) {
        _results.push(console.log('pending ' + functionCall + ' ~> ' + _trim(todo[0].toCypherQuery())));
      } else if (_.isArray(todo)) {
        query = todo[0].toCypherQuery();
        query = _trim(query);
        if (query !== _trim(todo[1])) {
          throw Error("Error by building query " + functionCall + " -> " + query);
        } else {
          _results.push(void 0);
        }
      } else {
        _results.push(console.log('skipping ' + functionCall + ' ~> ' + _trim(todo.toCypherQuery())));
      }
    }
    return _results;
  });
});
