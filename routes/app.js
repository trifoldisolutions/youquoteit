const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('app/index', { title: 'App — YouQuoteIt' });
});

router.get('/login', (req, res) => {
  res.render('app/login', { title: 'Log In / Sign Up — YouQuoteIt' });
});

router.get('/quotes', (req, res) => {
  res.render('app/quotes', { title: 'Quotes — YouQuoteIt' });
});

router.routes = [
  { method: 'GET', path: '/app', label: 'App index' },
  { method: 'GET', path: '/app/login', label: 'Log in / sign up' },
  { method: 'GET', path: '/app/quotes', label: 'Quotes (placeholder)' },
];

module.exports = router;
