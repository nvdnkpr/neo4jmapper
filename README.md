# Neo4jMapper
## Object modeler for neo4j graphdatabases
### Written in JavaScript and ready for browser- and serverside usage

[![Build Status](https://api.travis-ci.org/pstaender/neo4jmapper.png)](https://travis-ci.org/pstaender/neo4jmapper)
[![NPM version](https://badge.fury.io/js/neo4jmapper.png)](https://npmjs.org/package/neo4jmapper)
[![Dependency Status](https://gemnasium.com/pstaender/neo4jmapper.png)](https://gemnasium.com/pstaener/neo4jmapper)

### Links
  * [Sourcecode @ GitHub repository](https://github.com/pstaender/neo4jmapper)
  * [Documentation and Examples](http://pstaender.github.io/neo4jmapper)

### Why another neo4j client?

Neo4jMapper helps to get trivial neo4j-database-tasks quickly done.

Features:

  * **Querying graph, nodes and relationships** via object-chaining
  * **Object Modeling** for labeling, indexing and other schema-like behaviour 
  * **processes and transforms data** (flatten/unflatten, escaping, loading/populating …)

### Warning

**Neo4jMapper is not ready for productive environments until Neo4j v2 isn't finally released**. Neo4j v2 or above is mandatory. Currently it's tested against Neo4j Milestone 2.0.0-M05.

## How to use

### Installation

#### NodeJS

```sh
  $ npm install neo4jmapper
```
#### Browser

Include `examples/browser/neo4jmapper_complete.js` in your html-file and ensure that you have included [underscorejs](https://github.com/jashkenas/underscore/blob/master/underscore.js) and [superagent](https://github.com/visionmedia/superagent/blob/master/superagent.js) as well.

### Open Connections

```js
  var Neo4j = require('neo4jmapper');
  var neo4j = new Neo4j('http://localhost:7474');
```

or in the browser:

```js
  var neo4j = window.Neo4jMapper.init('http://localhost:7474');
```

## CRUD Nodes

### Create

```js
  var Node = neo4j.Node;

  new Node( { name: 'Dave Grohl', year: 1969 } ).save(function(err, dave) {
    if (err)
      console.error(err.message);
    else
      console.log('Node is persisted:', dave.toObject()); 
  });
```

Create relations between nodes:

```js
  new Node( { name: 'Foo Fighters' } ).save(function(err, fooFighters) {
    
    dave.createRelationTo(fooFighters, 'PLAYS', function(err, relationship) {
      console.log('Created Relationship:', relationship.toObject());

      new Node( { name: 'Taylor Hawkins' } ).save(function(err, taylor) {
        dave.createRelationBetween(taylor, 'ROCK', cb);
      });
    
    });
  
  });
```

Create relations with attributes:

```js
  dave.createRelationTo(fooFighters, 'PLAYS', { instrument: 'guitar' }, cb);
  taylor.createRelationTo(fooFighters, 'PLAYS', { instrument: 'drums' }, cb);
```

### Update 

```js
  console.log(dave.data.name);
  // ~> 'Dave Grohl'
  dave.data.firstName = 'Dave';
  dave.data.surname = 'Grohl';
  dave.save(cb);
```

or

```js
  Node.findById(dave.id).update({
    firstName: 'Dave',
    surname: 'Grohl'
  }, cb );
```

### Find or Create

Creates a new node with this attribute if not exists, updates if one (distinct) exists:

```js
  Node.findOrCreate({
    name: 'Dave Grohl'
  }, cb );
```

### Remove

We use `remove()` if we are on an instanced Node:

```js
  dave.remove(cb);
  // if you want to remove relationships as well
  dave.removeIncludingRelations(cb);
```

`delete()` if we perform a delete action on a query:

```js
  Node.findById(dave.id).delete(cb);
  // if you want to delete relationships as well
  Node.findById(dave.id).deleteIncludingRelations(cb);
```

### Find Nodes

Some examples:

```js
  Node.findOne({ name: 'Dave Grohl' }, function(err, dave) {
    if (err)
      console.error(err.message);
    else
      console.log('Found Node:', dave.toObject());
  });
```

```js
  Node.find({ year: 1969 }).limit(10, function(err, found) {
    if (found) {
      console.log(found.length + ' nodes found');
    }
  });
```

You can use `$and`, `$or`, `$not` and `$xor` operators in where conditions:

```js
  Node
    .find() // you can put your where condition inside find() as well
    .where( { $and: [ { year: 1969 }, { name: 'Dave Grohl'} ] } )
    .limit(1, cb);
```

Query relationships:

```js
  Node
    .findOne( { name: 'Dave Grohl' } )
    .incomingRelations('ROCKS|PLAYS', function(err, foundRelations) {
      console.log('Incoming relationships of Dave with "ROCKS" OR "PLAYS":', foundRelations);
    });
```

or query on instanced nodes:

```js
  dave.incomingRelations(function(err, relations) {
    console.log('All incoming relationships of Dave:', foundRelations);
  });
```

### Query Graph

Get processed and loaded results by using `Graph.start()…`

Here are some possible ways to go:

```js
  Graph.start().query( "CUSTOM CYPHER QUERY" , function(err, rows) {
    if (err) {
      console.error(err); // includes a stack and a reasonable error message
    } else {
      if (rows)
        for (var i=0; i < rows.length; i++) {
          console.log(rows[i].toObject());
        }
      }
    }
  });
```

Streaming gets interesting on large results:

```js
  Graph.start().stream( "CUSTOM CYPHER QUERY" , function(result) {
    if (result) {
      console.log(result.toObject());
    } else {
      console.log('Done');
    }
  });
```

Disable explicitly sort + loading to speed up response time (both are activated by default using `start()`):

```js
  Graph.start()
    .disableProcessing()
    .query( … , cb)
  // or if you want to choose what to switch on and off
  Graph.start()
    .disableLoading()
    .disableSorting()
    .query( … , cb)
```

You can chain your query elements and use conditional parameters for where clauses:

```js
  Graph
    .start()
    .match('(game:Game)-[c:contains]-(position:Position)')
    .where({ 'game.title': 'Wes vs Alvin' }) // values will be escaped
    .with('game, collect(position) AS positions')
    .match('game-[c:contains]-(position:Position)')
    .with('positions, c, position')
    .orderBy('c.move ASC')
    .match('position-[m:move]-next')
    .where('next IN (positions)')
    .return('(c.move+1)/2 as move, position.to_move as player, m.move, next.score as score')
    .limit(20, cb);
  /*
    ~>
      MATCH     (game:Game)-[c:contains]-(position:Position)
      WHERE     HAS (game.title) AND game.title = 'Wes vs Alvin'
      WITH      game, collect(position) AS positions
      MATCH     game-[c:contains]-(position:Position)
      WITH      positions, c, position
      ORDER BY  c.move ASC
      MATCH     position-[m:move]-next
      WHERE     next IN (positions)
      RETURN    (c.move+1)/2 as move, position.to_move as player, m.move, next.score as score
      LIMIT     20;
  */
```

```js
  Graph
    .start('n = node(*)')
    .case("n.eyes WHEN {color1} THEN 1 WHEN {color1} THEN 2 ELSE 3")
    .parameters({ color1: 'blue', color2: 'brown' })
    .return('n AS Person')
    .toCypherQuery();
  /* ~>
    START          n = node(*)
    CASE           n.eyes WHEN {color1} THEN 1 WHEN {color1} THEN 2 ELSE 3 END
    RETURN         n AS Person;
  */
```

Here are most of all available methods to query the graph. `…` represents the strings containing the statements:

```js
  Graph.start(…)
    .match(…)
    .onMatch(…)
    .where('n.name = {value1}')
    .parameters({value1: 'Bob'})
    .where({ 'n.name': 'Bob' }) // would save the `where(…)` and `parameters(…)` operations above
    .with(…)
    .orderBy(…)
    .skip(10)
    .limit(20)
    .delete(…)
    .return(…)
    .create(…)
    .onCreate(…)
    .createIndexOn(…)
    .createUnique(…)
    .dropIndexOn
    .merge(…)
    .remove(…)
    .set(…)
    .foreach(…)
    .case(…)
    .custom(…)
    .comment(…)
    .exec(cb) // or .stream(cb)
```

#### Raw Queries

If you want to enjoy the best performance, you can pass-through cypher queries 1:1 and get the almost native results from neo4j - almost because every result part will be parsed + transformed to a Node / Relationship / Path object.

Just start with `Graph.query(…)`:

```js
  Graph.query("START n = node(*) MATCH n-[r]-() RETURN n;", function(err, result) {
    console.log(err, result);
  });
```

Same works with stream:

```js
  Graph.stream("START n = node(*) MATCH n-[r]-() RETURN n;", function(result) {
    if (result)
      console.log(err, result);
    else
      console.log('done');
  });
```

#### Native Queries

Use the neo4jrestful client to query natively:

```js
  var client = Neo4jMapper.client;
  client.query|post|get|delete|put(…, cb);
```

### Modeling

We can define models based on the `Node` model (similar to models you might know from backbonejs for instance). 

Every extended model enjoys label support.

```js
  Node.register_model('Person', {
    fields: {
      indexes: {
        email: true
      },
      defaults: {
        created_on: function() {
          return new Date().getTime();
        }
      }
    },
    fullname: function() {
      var s = this.data.firstName + " " + this.data.surname;
      return s.trim();
    }
  }, function(err, Person) {

    var alice = new Person({firstName: 'Alice', surname: 'Springs'});

    alice.fullname();
    ~ Alice Springs

    alice.save(function(err, alice) {
      alice.toObject();
      ~ { id: 81238,
      classification: 'Node',
      data:
       { created_on: 1374758483622,
         surname: 'Springs',
         firstName: 'Alice' },
      uri: 'http://localhost:7420/db/data/node/81238',
      label: 'Person',
      labels: [ 'Person' ] }
    });

    // You can also use multiple inheritance
    // here: Director extends Person
    // Director will have the labels [ 'Director', 'Person' ]

    // You can skip the cb and work instantly with the registered model
    // if you don't use index/uid fields on your schema
    var Director = Person.register_model('Director', {
      fields: {
        defaults: {
          job: 'Director'
        }
      }
    });

    new Director({
      name: 'Roman Polanski'
    }).save(function(err, polanski) {
      polanski.toObject();
      ~ { id: 81239,
      classification: 'Node',
      data:
       { created_on: 1374758483625,
         name: 'Roman Polanski',
         job: 'Director' },
      uri: 'http://localhost:7420/db/data/node/81239',
      label: 'Director',
      labels: [ 'Director', 'Person' ] }
    });
  });

```

Coffeescript and it's class pattern is maybe the most convenient way to define models:

```coffeescript
  class Person extends Node
    fields:
      indexes:
        email: true
      defaults:
        created_on: - new Date().getTime()
    fullname: -
      s = @data.firstName + " " + @data.surname
      s.trim()

  Node.register_model Person, (err) -

    alice = new Person firstName: 'Alice', surname: 'Springs'
    alice.fullname()
    ~ 'Alice Springs'
    alice.save -
      alice.label
      ~ 'Person'

    class Director extends Person
    Node.register_model(Director)
```

### Iterate on large results (streaming)

Note: Sreaming is only working on NodeJS for now

You can iterate results asynchronously with the `each` method, it processes the stream of the response:

```js
  Node.findAll().each(function(node) {
    if (node)
      console.log(node.toObject());
    else
      console.log("Done");
  });
```

Keep in mind that there is **no extra loading executed on stream results** to keep the response time as good as possible. If you want to load a object from a streaming result (if you need labels for instance), you have to trigger it explicitly:

```js
  Person.findAll().each(function(person) {
    if (person) {
      person.load(function(err, load){
        // person is now fully loaded
        console.log(person.toObject());
      });
    }
  });
```

## Naming conventions

The query method names are heavily inspired by mongodb and mongoose - so most of them should sound familiar in case you have worked with them:

  * find, findOne, findById, findByUniqueKeyValue
  * where, whereNode, whereRelationship, whereStartNode, whereEndNode, whereRelationship, andWhereNode, …
  * andHasProperty, whereNodeHasProperty, whereRelationshipHasProperty, …
  * withRelatioships, incomingRelations, outgoingRelations, relationsBetween, incomingRelationsFrom(), outgoingRelationsTo() …
  * match
  * limit
  * skip
  * delete, deleteIncludingRelations
  * allLabels, createLabel, createLabels, replaceLabels, removeLabels
  …

Neo4jMapper is using the following identifiers in cypher queries:

  * `n` for a single [n]ode or a start node
  * `m` for an end node ([m]atch) (e.g. Node.findById(32).incomingRelationshipsFrom(12).toCypherQuery() ~ `START n = node(32), m = node(12) MATCH (n)

### So far tested against:

* Neo4j v2 Milestone 5
* Node 0.8 - 0.11
* Chrome (v22+) ( but Safari and Firefox should work as well)