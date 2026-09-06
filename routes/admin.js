const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('admin/index', { title: 'Admin — YouQuoteIt' });
});

router.routes = [
  { method: 'GET', path: '/admin', label: 'Admin index' },
];

module.exports = router;
