require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const anonUser = require('./middleware/anonUser');
const currentUser = require('./middleware/currentUser');

const publicRoutes = require('./routes/public');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3008;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Signed with SESSION_SECRET so the login-session cookie (see
// middleware/currentUser.js) can't be forged by the client.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(express.static(path.join(__dirname, 'public')));
app.use(anonUser);
app.use(currentUser);

// multer's disk storage (routes/app.js) writes here on every quote publish
// that includes a device-uploaded background — ensure it exists up front
// rather than failing on the first upload after a fresh clone/deploy.
fs.mkdirSync(path.join(__dirname, 'public', 'uploads', 'quote-backgrounds'), { recursive: true });

const facades = [
  { name: 'Public', mount: '/', router: publicRoutes },
  { name: 'App', mount: '/app', router: appRoutes },
  { name: 'Admin', mount: '/admin', router: adminRoutes },
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
