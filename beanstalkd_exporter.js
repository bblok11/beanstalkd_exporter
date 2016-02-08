var Prometheus = require("prometheus-client");
var fivebeans = require('fivebeans');
var argv = require('yargs')
    .usage('Usage: $0 <servers> [options]')
    .example('$0 127.0.0.1:11300 192.168.2.100 -p 9010', 'Listen to Beanstalkd at 127.0.0.1, port 9010')
    .alias('p', 'port')
    .alias('i', 'interval')
    .default('p', 9011)
    .default('i', 10)
    .describe('p', 'Server port')
    .describe('i', 'Update interval (seconds)')
    .demand(1)
    .help('h')
    .argv;

var servers = argv._;
var serverPort = argv.p;
var updateInterval = parseInt(argv.i);

// Prepare server configs
var serverConfigs = [];

servers.forEach(function(server){

    var serverParts = server.split(':');
    serverConfigs.push({
        host: serverParts[0],
        port: serverParts.length > 1 ? parseInt(serverParts[1]) : 11300,
        connection: null
    });
});

var prometheus = new Prometheus();

var up = prometheus.newGauge({
    namespace: "beanstalkd",
    name: "up",
    help: "Server is up"
});

var global_jobs_ready = prometheus.newGauge({
    namespace: "beanstalkd",
    name: "global_jobs_ready",
    help: "STATS current-jobs-ready"
});

prometheus.listen(serverPort);
console.log('Server listening at port ' + serverPort + '...');

function connect() {


}

function update() {

    console.log('Updating');

    serverConfigs.forEach(function (server) {

        var serverId = server.host + ':' + server.port;

        var beanstalk = new fivebeans.client(server.host, server.port);
        beanstalk
            .on('connect', function () {

                console.log('Server ' + serverId + ' up');

                // Set up
                up.set({
                    server: serverId
                }, 1);
            })
            .on('error', function (err) {

                // Set down
                console.log('Server ' + serverId + ' down');

                up.set({
                    server: serverId
                }, 0);
            })
            .connect();
    });
}

update();

setInterval(update, updateInterval * 1000);