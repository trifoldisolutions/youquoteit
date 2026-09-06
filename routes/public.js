const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('public/index', { title: 'YouQuoteIt' });
});

router.routes = [
  { method: 'GET', path: '/', label: 'Landing page' },
];

module.exports = router;
