#!/usr/bin/env node
var Promise = require('bluebird'),
    argv = require('minimist')(process.argv.slice(2)),
    redis = require('./lib/redis').createClient(),
    levenshtein = require('fast-levenshtein'),
    express = require('express');

function scanIndex(kw, cursor, matches) {
    cursor = cursor || 0;
    matches = matches || [];

    return redis.hscan('search_index', cursor, 'MATCH', '*' + kw + '*', 'COUNT', 10000)
        .then(function (data) {
            var nextCursor = data[0];
            var answers = data[1];
            for (var i = 1; i < answers.length; i = i + 2) {
                matches.push(answers[i]);
            }
            if (nextCursor != '0') {
                return scanIndex(kw, nextCursor, matches);
            } else {
                return {
                    keyword: kw,
                    matches: matches
                };
            }
        });
}

var app = express();

function tokenize(word) {
    return word.replace(/[-_\.]/, ' ').split(' ');
}

var compareResults = function(keyword) {
    return function (a, b) {
        if (a == keyword) {
            return -1
        }
        if (a.indexOf(keyword) != -1) {
            if (b.indexOf(keyword) == -1) {
                return -2;
            }
            var aPosition = tokenize(a).indexOf(keyword);
            if (aPosition != -1) {
                var bPosition = tokenize(b).indexOf(keyword);
                if (bPosition == -1) {
                    return -3;
                }
                if (aPosition == 0 && bPosition != 0) {
                    return -4;
                }
            } else {
                return 1;
            }
        } else {
            return 2;
        }
        var aDistance = levenshtein.get(keyword, a);
        var bDistance = levenshtein.get(keyword, b);
        if (aDistance == bDistance) {
            return a > b ? 3 : -5;
        }
        return aDistance - bDistance;
    }
};

var orderResults = function(result) {
    return result.matches.sort(compareResults(result.keyword));
};

var limitSize = function(results) {
    return results.slice(0, 10);
};

var getDetails = function(results) {
    return results.map(function (name) {
        return redis.hgetall(name)
            .then(function(details) {
                if (details.ver) {
                    details.ver = details.ver.split(',');
                }
                return details;
            });
    });
};

app.get('/search/:keyword', function(req, res) {
    var keyword = req.params.keyword;
    scanIndex(keyword)
        //.then(orderResults)
        //.then(limitSize)
        //.then(getDetails)
        //.all()
        .then(function(results) {
            res.send(results);
        });
});

app.listen(3000);