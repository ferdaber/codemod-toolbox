const t = require('babel-types')
const traverse = require('babel-traverse').default
const recast = require('recast')
const find = require('find')
const fs = require('fs')
const chalk = require('chalk').default
const jestDiff = require('jest-diff')

const debug = str => chalk`{bold.white.bgBlackBright  DEBUG } ${str}`
const info = str => chalk`{bold.black.bgWhite  INFO } ${str}`
const warn = str => chalk`{bold.black.bgYellow  WARN } ${str}`
const error = str => chalk`{bold.white.bgRed  ERROR } ${str}`
const diff = (before, after) => jestDiff(before, after, { aAnnotation: 'Before', bAnnotation: 'After', expand: false })

function codemod({ debug: debugCount, ignorePatterns, matchPattern }) {
    let currentFilePath

    const loc = node => `${currentFilePath}:${node.loc.start.line}:${node.loc.start.column}`
    const log = (str, minLevel = 1) => debugCount >= minLevel && console.log(debug(str))

    const hasTranslationsVisitor = {
        'Identifier|Literal'(path) {
            if (path.node.name === 'translations' || path.node.value === 'translations') {
                !this.hasTranslations && log(`Translations usage found for file: ${loc(path.node)}`, 2)
                this.hasTranslations = true
            }
        },
    }

    find.eachfile(matchPattern, process.cwd(), filePath =>
        fs.readFile(filePath, (err, data) => {
            currentFilePath = filePath
            if (err) {
                throw err
            }
            if (ignorePatterns.some(pattern => pattern.test(currentFilePath))) {
                log(`Ignoring file: ${currentFilePath}`, 3)
                return
            }
            const src = data.toString()
            try {
                log(`Parsing file: ${currentFilePath}`, 3)
                /** @type {import('babel-types').File} */
                const ast = recast.parse(src, {
                    parser: require('recast/parsers/babylon'),
                    quote: 'single',
                    trailingComma: {
                        objects: true,
                    },
                    arrayBracketSpacing: true,
                })
                let codemodCommitted = false
                traverse(ast, {
                    /** @param {import('babel-traverse').NodePath} path */
                    MemberExpression(path) {
                        if (t.isArrayExpression(path.node.object) || t.isCallExpression(path.node.object)) {
                            return
                        }
                        const ctx = {}
                        path.get('object').traverse(hasTranslationsVisitor, ctx)
                        if (ctx.hasTranslations) {
                            const term = t.isIdentifier(path.node.property)
                                ? t.stringLiteral(path.node.property.name)
                                : path.node.property
                            log(
                                `Found an interpolated term "${recast.print(term).code.trim()}" in file: ${loc(
                                    path.node
                                )}`,
                                2
                            )
                            path.replaceWith(t.callExpression(t.identifier('t'), [term]))
                            codemodCommitted = true
                        }
                    },
                })
                if (codemodCommitted) {
                    const lastImportIdx = ast.program.body.reduce(
                        (idx, s, i) => (t.isImportDeclaration(s) ? i : idx),
                        -1
                    )
                    ast.program.body.splice(
                        lastImportIdx + 1,
                        0,
                        t.importDeclaration(
                            [t.importSpecifier(t.identifier('t'), t.identifier('t'))],
                            t.stringLiteral('i18next')
                        )
                    )
                }
                const newSrc = recast.print(ast).code
                if (src !== newSrc) {
                    const srcDiff = diff(src, newSrc)
                    log(`Codemod successful for file: ${currentFilePath}\n${srcDiff}`)
                }
            } catch (parseError) {
                console.log(error(`Parsing failed for file: ${currentFilePath}`), parseError)
                throw parseError
            }
        })
    )
}

module.exports = codemod
