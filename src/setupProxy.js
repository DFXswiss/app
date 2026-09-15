const path = require('path');
const fs = require('fs');
const express = require('express');

// Serves the App 2.0 artifact at /app2/ during `npm start`, matching the Pages layout.
// Build it first with `npm run app2:loc`. Without the artifact the path 404s — visual
// and full-stack tests that open /app2/ then fail instead of skipping.
module.exports = function setupProxy(app) {
  const app2Dir = path.join(__dirname, '..', 'app2-dist');
  if (!fs.existsSync(path.join(app2Dir, 'index.html'))) return;

  app.use('/app2', (req, res, next) => {
    const match = req.path.match(/^\/(buy\/success|buy\/failure|account-merge)\/?$/i);
    if (!match) return next();
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(302, `/app2/#/${match[1].toLowerCase()}${search}`);
  });
  app.use('/app2', express.static(app2Dir));
  app.use('/app2', (req, res, next) => {
    res.sendFile(path.join(app2Dir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
};
