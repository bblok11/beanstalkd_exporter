# Beanstalkd Server Exporter

Prometheus exporter for Beanstalkd server metrics.

## Running

    npm install
    node beanstalkd_exporter server1:11300 server2:11300
    
## Usage

    Usage: beanstalkd_exporter <servers> [options]
    
    Options:
      -p, --port  Server port                                        [default: 9011]
      -h, --help  Show help                                                [boolean]
    
    Examples:
      beanstalkd_exporter 127.0.0.1:11300       Listen to Beanstalkd at 127.0.0.1,
      192.168.2.100 -p 9010                     port 9010

## Collectors

The exporter collects both global and per tube stats. See the [Beanstalkd protocol documentation](https://github.com/kr/beanstalkd/blob/master/doc/protocol.txt) ('stats' and 'stats-tube' commands) for all fields.