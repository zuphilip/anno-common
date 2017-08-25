const express = require('express')
const async = require('async')
const {envyConf} = require('envyconf')
const fs = require('fs')
// const compression = require('compression')

const config = envyConf('ANNO', {
    PORT: "3000",
    BASE_URL: 'http://localhost:3000',
    BASE_PATH: '',
    SERVER_SESSION_KEY: '9rzF3nWDAhmPS3snhh3nwe4RCDNebaIkg7Iw3aJY9JLbiXxnVahcTCckuls6qlaK',
    STORE: '@kba/anno-store-file',
    DIST_DIR: __dirname + '/dist',
    SERVER_AUTH: '',
    ENABLE_JWT_AUTH: 'true',
    // ENABLE_COMPRESSION: 'true',
})
function start(app, cb) {
    // Static files
    app.use('/dist', express.static(envyConf('ANNO').DIST_DIR))
    // app.use(compression())

    app.use(require('morgan')('dev'))

    app.set('views', `${__dirname}/views`)
    app.set('view engine', 'pug')

    app.use(require('body-parser').urlencoded({ extended: true }));
    app.use(require('body-parser').json({type: '*/*', limit: 1 * 1024 * 1024 }))

    app.use(require('cookie-parser')());
    app.use(require('express-session')({
        secret: envyConf('ANNO').SERVER_SESSION_KEY,
        resave: false,
        saveUninitialized: false
    }))

    const store = require('@kba/anno-store').load({
        loadingModule: module,
        loadPlugins: require('@kba/anno-util-loaders').loadPlugins,
    })

    const routes = [ 'anno', 'swagger', 'token' ]
    const middlewares = [
        'anno-options',
        'user-auth',
        'acl-metadata',
        'cors',
    ]

    async.map(middlewares, (middleware, doneMiddleware) => {
        console.log(`Loading middleware ${middleware}`)
        require(`./middleware/${middleware}`)(doneMiddleware)
    }, (err, [
        annoOptions,
        userAuth,
        aclMetadata,
        cors,
    ]) => {
        if (err)
            return cb(err)
        app.use(cors)
        store.init(err => {
            if (err) return cb(err)

            const annoMiddlewares = []
            annoMiddlewares.push(annoOptions.unless({method:'OPTIONS'}))
            if (config.ENABLE_JWT_AUTH) annoMiddlewares.push(userAuth.unless({method:'OPTIONS'}))
            annoMiddlewares.push(aclMetadata.unless({method:'OPTIONS'}))

            app.use('/anno', ...annoMiddlewares, require('./routes/anno')({store}))
            app.use('/swagger', require('./routes/swagger')())
            if (config.SERVER_AUTH)
                app.use('/auth',
                    annoOptions.unless({method:'OPTIONS'}),
                    require(`./routes/auth-${config.SERVER_AUTH}`)({store})
                )

            app.get('/favicon.ico', (req, resp, next) => {
                fs.readFile(`${__dirname}/public/favicon.ico`, (err, ico) => {
                    if (err) return next(err)
                    resp.header('Content-Type', 'image/x-icon')
                    return resp.send(ico)
                })
            })

            // Fallback for GET: Redirect /:id to /anno/:id for pretty short URL
            app.get('/:id', (req, resp, next) => {
                resp.header('Location', `anno/${req.params.id}`)
                resp.status(302)
                resp.end()
            })

            // Error handler
            app.use(require('./middleware/error-handler')())
            return cb()
        })
    })
}

const app = express()
start(app, (err) => {
    // console.log("Config", JSON.stringify(envyConf('ANNO'), null, 2))
    if (err) throw err
    app.listen(envyConf('ANNO').PORT, () => {
        console.log("Config", JSON.stringify(envyConf('ANNO'), null, 2))
        console.log(`Listening on port ${envyConf('ANNO').PORT}`)
    })
})

