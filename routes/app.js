const express = require('express');
const router = express.Router();

// Mirrors the [data-theme] blocks defined in src/input.css.
const THEMES = [
  { id: 'daylight', name: 'Daylight' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'ember', name: 'Ember' },
  { id: 'dawn', name: 'Dawn' },
  { id: 'candy', name: 'Candy' },
  { id: 'mono', name: 'Mono' },
  { id: 'harbor', name: 'Harbor' },
  { id: 'forest', name: 'Forest' },
];

// Temporary in-memory sample data, standing in for the future quotes API.
const SAMPLE_QUOTES = [
  {
    id: 'q1',
    text: 'Only those who will risk going too far can possibly find out how far one can go.',
    author: 'T. S. Eliot',
    category: 'wisdom',
    bgImage: null,
    views: 128400,
    likes: 9821,
    comments: 642,
    screenshots: 3480,
  },
  {
    id: 'q2',
    text: 'The unexamined life is not worth living.',
    author: 'Socrates',
    category: 'life',
    bgImage: null,
    views: 84210,
    likes: 5310,
    comments: 318,
    screenshots: 1920,
  },
  {
    id: 'q3',
    text: 'The only way to do great work is to love what you do.',
    author: 'Steve Jobs',
    category: 'technology',
    bgImage: null,
    views: 302150,
    likes: 41800,
    comments: 2140,
    screenshots: 15600,
  },
  {
    id: 'q4',
    text: 'In the middle of every difficulty lies opportunity.',
    author: 'Albert Einstein',
    category: 'change',
    bgImage: null,
    views: 152300,
    likes: 12990,
    comments: 875,
    screenshots: 4720,
  },
  {
    id: 'q5',
    text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Aristotle',
    category: 'wisdom',
    bgImage: null,
    views: 96100,
    likes: 7420,
    comments: 401,
    screenshots: 2260,
  },
  {
    id: 'q6',
    text: 'Where there is love there is life.',
    author: 'Mahatma Gandhi',
    category: 'love',
    bgImage: null,
    views: 61230,
    likes: 5990,
    comments: 289,
    screenshots: 1740,
  },
];

router.get('/', (req, res) => {
  res.render('app/index', { title: 'YouQuoteIt', quotes: SAMPLE_QUOTES, themes: THEMES });
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
