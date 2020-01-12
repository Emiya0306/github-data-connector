"use strict";

import gulp from 'gulp';
import rename from 'gulp-rename';
import server from 'gulp-express';
import rimraf from 'rimraf';
import browserify from 'browserify';
import uglifyify from 'uglifyify';
import glob from 'glob';
import source from 'vinyl-source-stream';

gulp.task('clean', (cb) => {
  rimraf('./build', cb);
});

gulp.task('build:js:github', () => {
  let files = glob.sync('./src/github/**/*.js', { ignore: ['./src/github/assets/*.js'] });
  return browserify({entries: files})
    .transform("babelify", {presets: ["es2015"]})
    .transform('uglifyify')
    .bundle()
    .pipe(source('bundle.js'))
    .pipe(gulp.dest('./build/github'));
});

gulp.task('build:schema:github', () => {
  return gulp.src('src/github/**/*.json')
    .pipe(rename({dirname: ''}))
    .pipe(gulp.dest('./build/github/schema'));
});

gulp.task('build:assets:github', () => {
  return gulp.src('src/github/assets/**/*')
    .pipe(rename({dirname: ''}))
    .pipe(gulp.dest('./build/github/assets'));
});

gulp.task('build:css:github', () => {
  return gulp.src('src/github/**/*.css')
    .pipe(rename({dirname: ''}))
    .pipe(gulp.dest('./build/github'));
});

gulp.task('build:html:github', () => {
  return gulp.src('src/github/**/*.html')
    .pipe(rename({dirname: ''}))
    .pipe(gulp.dest('./build/github'));
});

gulp.task('build:github', gulp.parallel('build:js:github', 'build:schema:github', 'build:css:github', 'build:assets:github', 'build:html:github'));

gulp.task('build', gulp.parallel('build:github'));

gulp.task('connect:server', function () {
  server.run(['app.js']);

  // Restart the server on file changes.
  gulp.watch(['src/github/index.html'], server.notify);
  gulp.watch(['src/**/*.js'], gulp.series('build', server.run));
  gulp.watch(['app.js'], server.run);
});

gulp.task('default', gulp.series('clean', 'build', 'connect:server'));
