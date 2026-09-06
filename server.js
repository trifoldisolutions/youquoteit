require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const publicRoutes = require('./routes/public');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');
const tasksRoutes = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 3008;

app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views'), path.join(__dirname, 'dev_resources')]);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const facades = [
  { name: 'Public', mount: '/', router: publicRoutes },
  { name: 'App', mount: '/app', router: appRoutes },
  { name: 'Admin', mount: '/admin', router: adminRoutes },
  { name: 'Dev Resources', mount: '/dev-resources', router: tasksRoutes },
];

facades.forEach(({ mount, router }) => app.use(mount, router));

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'youquoteit' })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

app.listen(PORT, () => {
  console.log(`\nyouquoteit running on http://localhost:${PORT}\n`);
  console.log('Route map:');
  facades.forEach(({ name, router }) => {
    console.log(`\n  ${name}`);
    (router.routes || []).forEach(({ method, path: routePath, label }) => {
      console.log(`    ${method.padEnd(5)} http://localhost:${PORT}${routePath} — ${label}`);
    });
  });
  console.log('');
});
