#!/usr/bin/env node
var Promise = require('bluebird'),
    minimist = require('minimist'),
    log = require('logging').from(__filename),
    elasticsearch = require('elasticsearch'),
    couchdb = require('./lib/couchdb'),
    cdb,
    es;

function getCouchConfig(argv) {
    var couchConfig = {};
    couchConfig.host = argv.couchdb ? argv.couchdb.split(':')[0] : 'skimdb.npmjs.com';
    couchConfig.port = argv.couchdb && argv.couchdb.indexOf(':') > -1 ? argv.couchdb.split(':')[1].split('/')[0] : 443;
    couchConfig.db = argv.couchdb && argv.couchdb.indexOf('/') > -1 ? argv.couchdb.split('/')[1] : 'registry';
    return couchConfig;
}

function main(argv) {
    log(argv);
    cdb = couchdb.client(getCouchConfig(argv));

    es = elasticsearch.Client({
        host: argv.es || 'localhost:9200',
        sniffInterval: 60000,
        suggestCompression: true
    });

    es.transport.sniff(function() {
        if (argv.init) {
            initializeCache()
                .then(function() {
                    delete argv.init;
                    main(argv);
                });
        } else {
            updateCache(argv.freq*1000 || 5000);
        }
    });
}

function addDocumentToCache(document) {
    if (document.name) {
        var pkg = {
            name: document.name
        };
        if (document.description) {
            pkg.desc = document.description;
        }
        if (document.keywords) {
            pkg.kw = document.keywords;
        }
        if (document.versions) {
            pkg.ver = Object.keys(document.versions);
        }
        if (document.time && document.time.modified) {
            pkg.time = document.time.modified
        }
        return es.index({
            index: 'packages',
            type: 'package',
            id: document.name,
            body: pkg
        });
    }
    return Promise.resolve();
}

function getDocumentsSlice(start, size) {
    log('Getting ' + size + ' document(s) from ' + start);
    return cdb.all({limit: size, skip: start, include_docs: true})
        .map(function (document) {
            addDocumentToCache(document.doc);
        });
}

function clearIndex() {
    return es.indices.exists({ index: 'packages' })
        .then(function(exists) {
            if (exists) {
                return es.indices.delete({ index: 'packages' });
            }
            return Promise.resolve();
        })
        .then(function() {
            return es.indices.exists({ index: 'info' })
                .then(function(exists) {
                    if (exists) {
                        return es.indices.delete({ index: 'info' });
                    }
                    return Promise.resolve();
                })
        })
        .then(function() {
            return es.indices.create({ index: 'packages' })
        })
        .then(function() {
            return es.indices.create({ index: 'info' })
        });
}

function initializeCache() {
    log('Initializing cache...');
    return cdb.info()
        .then(function(info) {
            log('Update seq: ', info.update_seq);
            log('Documents count: ', info.doc_count);
            var slicesCount = 100;
            var sliceSize = Math.ceil(info.doc_count/ slicesCount);
            return clearIndex()
                .then(function() {
                    var slices = [0];
                    for (var i=1; i<slicesCount; i++) {
                        slices.push(slices[i-1]+sliceSize);
                    }
                    return slices;
                })
                .each(function(start) {
                    return getDocumentsSlice(start, sliceSize);
                }, {concurrency: 1})
                .then(function() {
                    return es.index({
                        index: 'info',
                        type: 'seq',
                        id: 'update_seq',
                        body: { value: info.update_seq }
                    });
                });
        });
}

function updateCache(freq) {
    es.get({
            index: 'info',
            type: 'seq',
            fields: [ 'value' ],
            id: 'update_seq'
        })
        .then(function (seq) {
            if (seq === null) {
                return Promise.reject('Uninitialized index, use --init to initialize');
            }
            var last_seq = seq.fields.value;
            return cdb.changes({since: last_seq, include_docs: true})
                .then(function(documents) {
                    var documentsCount = documents.length;
                    log(documentsCount + ' document(s) changed since seq ' + seq.fields.value);
                    for (var i = 0; i < documentsCount; i++) {
                        var document = documents[i];
                        addDocumentToCache(document.doc);
                        last_seq = Math.max(last_seq, document.seq);
                    }
                    log('Waiting for next changes...');
                    return es.index({
                        index: 'info',
                        type: 'seq',
                        id: 'update_seq',
                        body: { value: last_seq }
                    });
                });
        })
        .delay(freq)
        .then(function() {
            updateCache(freq);
        })
        .catch(function(err) {
            log(err);
        });
}

main(minimist(process.argv.slice(2)));
