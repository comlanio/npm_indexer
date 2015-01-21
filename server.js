#!/usr/bin/env node
var Promise = require('bluebird'),
    elasticsearch = require('elasticsearch').Client(),
    express = require('express');

var app = express();

app.get('/search', function(req, res) {
    var keyword = req.query.q;
    if (keyword.join) {
        keyword = keyword.join(' ');
    }
    return elasticsearch.search({
            index: 'packages',
            fields: ['name', 'desc', 'ver', 'time'],
            size: 100,
            filter: {
                exists: { field: 'ver' }
            },
            sort: [ '_score:desc', 'time:desc'],
            body: {
                query: {
                    dis_max: {
                        queries: [
                            {
                                match: {
                                    name: {
                                        query: keyword,
                                        boost: 2
                                    }
                                }
                            },
                            {
                                match: {
                                    desc: keyword
                                }
                            }
                        ]
                    }
                }
            }
        })
        .then(function(results) {
            res.send(results.hits.hits.map(function(hit) {
                var pkg = {
                    //score: hit._score,
                    //time: hit.fields.time,
                    name: hit.fields.name[0]
                };
                if (hit.fields.desc) {
                    pkg.desc = hit.fields.desc[0];
                }
                if (hit.fields.ver) {
                    pkg.ver = hit.fields.ver.sort().pop();
                }
                return pkg;
            }));
        });
});

app.listen(3000);