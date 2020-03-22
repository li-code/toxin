const { src, dest, watch, parallel, series } = require('gulp');
const rename = require('gulp-rename');
const browserSync = require('browser-sync');
const reload = browserSync.reload;

let isEnvDev = false;

const path = {
    src: './src',
    dest: './dest',
}
path.data = {
    src: path.src + '/_data',
    filename: 'data.json',
};
path.styles = {
    src: path.src + '/styles',
    dest: path.dest + '/styles',
};
path.scripts = {
    src: path.src + '/scripts',
    dest: path.dest + '/scripts',
};
path.fonts = {
    src: path.src + '/fonts',
    filename: '**/*',
    dest: path.dest + '/fonts',
};
path.images = {
    src: path.src + '/images',
    filename: '**/*.+(jpg|png|webp|svg)',
    dest: path.dest + '/images',
};
path.favicon = {
    src: path.src,
    filename: 'favicon.ico',
    dest: path.dest,
};
path.htaccess = {
    src: path.src,
    dest: path.dest,
    filename: '.htaccess.config',
};
path.html = {
    src: path.src,
    dest: path.dest,
};
path.templates = {
    src: path.src + '/_templates',
    dest: path.src,
};

function copy(key) {
    return src(path[key].src + '/' + path[key].filename).pipe(dest(path[key].dest));
}
function fonts() {
    return copy('fonts');
}
function images() {
    return copy('images');
}
function favicon() {
    return copy('favicon');
}
function htaccess() {
    return src(path.htaccess.src + '/' + path.htaccess.filename)
        .pipe(rename('.htaccess'))
        .pipe(dest(path.htaccess.dest));
}

function styles() {
    const postcss = require('gulp-postcss');
    const autoprefixer = require('autoprefixer');
    const cssnano = require('cssnano');
    const sass = require('gulp-sass');

    return src([path.styles.src + '/*.scss', '!' + path.styles.src + '/_*.scss'])
        .pipe(sass().on('error', sass.logError))
        .pipe(postcss([
            autoprefixer(),
            cssnano(),
        ]))
        .pipe(dest(path.styles.dest))
        .pipe(browserSync.stream());;
}

function scripts(done) {
    const glob = require('glob');
    const browserify = require('browserify');
    const babelify = require("babelify");
    const source = require('vinyl-source-stream');

    return glob(path.scripts.src + '/*.js', function (error, files) {
        if (error) {
            return done(error);
        }

        const promises = [];
        const presets = ['@babel/preset-env'];
        const destination = isEnvDev ? path.scripts.src : path.scripts.dest;
        if (!isEnvDev) {
            presets.push('minify');
        }
        files.forEach(function (file) {
            promises.push(new Promise( (resolve) => {
                browserify({ entries: [file] })
                    .transform(babelify.configure({
                        presets: presets,
                    }))
                    .bundle()
                    .pipe(source(file))
                    .pipe(rename({
                        dirname: '',
                        extname: '.min.js',
                    }))
                    .pipe(dest(destination))
                    .on('finish', resolve);
            }));
        });

        return Promise.all(promises).then(done);
    });
}
function scriptsDev(done) {
    isEnvDev = true;
    return scripts(done);
}

function clean() {
    const del = require('del');

    return del([
        path.dest,
        path.templates.dest + '/**/*.html',
        path.scripts.src + '/*.min.js',
    ], { force: true });
}

function delEmptyFolders(cb) {
    const deleteEmpty = require('delete-empty');

    deleteEmpty(path.src)
        .then(deleted => {
            console.log('Список удалённых папок: ', deleted);
            cb();
        });
}

function render() {
    const fs = require('fs');
    const nunjucks = require('nunjucks');
    const markdown = require('nunjucks-markdown');
    const marked = require('marked');
    const gulpNunjucks = require('gulp-nunjucks');

    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.templates.src));
    marked.setOptions({
        "headerIds": false,
    });
    markdown.register(env, marked);

    return src(path.templates.src + '/pages/**/*.njk')
        .pipe(rename(function (path) {
            if (path.basename !== 'index') {
                path.dirname += '/' + path.basename;
                path.basename = 'index';
            }
            path.extname = ".html";
        }))
        .pipe(gulpNunjucks
            .compile(
                JSON.parse(fs.readFileSync(path.data.src + '/' + path.data.filename, 'utf8')),
                {
                    env: env,
                }
            )
        )
        .pipe(dest(path.dest));
}

function html() {
    const htmlmin = require('gulp-htmlmin');

    return src(path.html.src + '/**/*.html')
        .pipe(htmlmin({
            collapseWhitespace: true,
            removeComments: true
        }))
        .pipe(dest(path.html.dest));
}

function serve() {
    browserSync.init({
        server: path.dest,
    });

    watch([path.data.src + '/' + path.data.filename, path.templates.src]).on('change', series(render, reload));
    watch([path.styles.src + '/**/*.scss']).on('change', styles);
    // watch([path.scripts.src + '/**/*.js', '!' + path.scripts.src + '/*.min.js']).on('change', series(scriptsDev, reload));
}

const removeDest = series(clean, delEmptyFolders);
const build = series(removeDest, render, parallel(styles, scripts, html, fonts, images, favicon));

exports.build = build;
exports.serve = series(clean, parallel(render, styles, fonts, images), serve);
exports.clean = removeDest;

exports.default = build;
