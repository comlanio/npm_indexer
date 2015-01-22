# npm_indexer
ElasticSearch based npmjs database indexer

## Requirements
- node.js
- elasticsearch
- nomjs couchdb replica

## Installation
```
git clone https://github.com/comlanio/npm_indexer.git
cd npm_indexer
npm install
```

## Usage
### Indexing
#### Initialization
./indexer.js --init [--es elasticsearch_address:port] [--couchdb couchdb_address:port/database] [--freq refresh_frequency_secs]

#### Update
./indexer.js [--es elasticsearch_address:port] [--couchdb couchdb_address:port/database] [--freq refresh_frequency_secs]

### Search server
./server.js [-p listening_port]

### Defaults
If not defined on cli, the following value apply :
- elasticsearch_address:port : localhost:9200
- couchdb_address:port/database : skimdb.npmjs.com:443/registry (public npmjs replica)
- refresh_frequency_secs : 5
- listening_port : 3000

## Searching a package
```
curl server_ip:port/search?q=keyword
```
