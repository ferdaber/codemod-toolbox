const codemod = require('./index')
const yargs = require('yargs')

const args = yargs
    .options({
        debug: {
            alias: 'd',
            describe: 'Log informational statements and do not commit codemod',
            count: true,
        },
        ignore: {
            alias: 'i',
            describe: 'Ignore a file from being processed',
            string: true,
            array: true,
            default: [/\/app\/web\/test/],
        },
    })
    .help().argv
codemod({
    debug: args.debug,
    ignorePatterns: args.ignore,
    matchPattern: args._[0] ? new RegExp(args._[0]) : /\/app\/web\/.*\.jsx?$/,
})
