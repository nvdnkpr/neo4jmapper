sequence = require('futures').sequence.create()
log = -> console.log(Array::slice.call(arguments).join(' '))
{argv} = require('optimist')

console.log '**Neo4jMapper Benchmark**'
console.log '(c) 2013 by Philipp Staender'
console.log 'Usage: coffee benchmark/benchmark.coffee (--reverse)'

summary = (next, suite) ->
  log "\n"
  log "  **Fastest** is " + suite.filter("fastest").pluck("name")
  log "  **Slowest** is " + suite.filter("slowest").pluck("name")
  next()

for description, suite of { 'Create': require('./create').suite, 'Read': require('./read').suite, 'Delete': require('./delete').suite }
  do (suite) ->
    sequence.then (next) ->
      suite.on 'complete', ->
        summary(next, this)
      log "\n### #{description}\n"
      if argv.reverse
        suite.reverse()
      suite.run async: true

sequence.then (next) ->    
  log '\n### Finished '
  process.exit(0)
