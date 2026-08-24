const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const data = require('./src/data');
const { getFail, applyGlobalDelay, renderServerError } = require('./src/helpers');

const PORT = process.env.PORT || 4000;
const SESSION_IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || 5 * 60 * 1000;

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: 'mock-legacy-bank-app-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { maxAge: SESSION_IDLE_TIMEOUT_MS }
  })
);

// Global behaviors: artificial delay + forced session expiry, applied to
// every route except the login screen, reset endpoint, and static assets.
app.use(async (req, res, next) => {
  await applyGlobalDelay(req);

  const skipExpiry = req.path === '/login' || req.path === '/reset' || req.path === '/session-expired';
  if (!skipExpiry && getFail(req) === 'session_timeout') {
    req.session.destroy(() => {
      res.cookie('seen', '1', { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: true });
      res.render('session-expired');
    });
    return;
  }
  next();
});

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  if (req.cookies && req.cookies.seen === '1') {
    return res.render('session-expired');
  }
  return res.redirect('/login');
}

app.get('/', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const username = (req.body.u || '').trim();
  const password = req.body.p || '';
  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required.' });
  }
  req.session.loggedIn = true;
  req.session.username = username;
  res.cookie('seen', '1', { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: true });
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/session-expired', (req, res) => {
  res.render('session-expired');
});

app.get('/dashboard', requireLogin, (req, res) => {
  res.render('dashboard', { username: req.session.username });
});

// ---- Main content iframe routes ----

app.get('/app/search', requireLogin, (req, res) => {
  const fail = getFail(req);
  if (fail === 'server_error') return renderServerError(res);

  const q = req.query.q || '';
  let results = null;
  if (q || fail === 'not_found') {
    results = fail === 'not_found' ? [] : data.searchMembers(q);
  }
  res.render('frame/search', { q, results, fail });
});

app.post('/app/member', requireLogin, (req, res) => {
  const fail = getFail(req);
  if (fail === 'server_error') return renderServerError(res);
  if (fail === 'permission_denied') {
    return res.render('frame/detail', { member: null, permissionDenied: true, fail });
  }

  const member = data.findMemberById(req.body.id);
  if (!member) {
    return res.render('frame/detail', { member: null, permissionDenied: false, fail });
  }
  res.render('frame/detail', { member, permissionDenied: false, fail });
});

// ---- Nested sub-accounts iframe routes ----

app.get('/app/member/:id/subaccounts', requireLogin, (req, res) => {
  const fail = getFail(req);
  if (fail === 'server_error') return renderServerError(res);

  const member = data.findMemberById(req.params.id);
  if (!member) return renderServerError(res);
  res.render('frame/subaccounts', { member, fail });
});

app.get('/app/member/:id/subaccounts/new', requireLogin, (req, res) => {
  const fail = getFail(req);
  if (fail === 'server_error') return renderServerError(res);

  const member = data.findMemberById(req.params.id);
  if (!member) return renderServerError(res);
  res.render('frame/subaccount-new', {
    member,
    fail,
    error: null,
    values: { type: 'Savings', deposit: '' }
  });
});

app.post('/app/member/:id/subaccounts/review', requireLogin, (req, res) => {
  const fail = getFail(req);
  if (fail === 'server_error') return renderServerError(res);

  const member = data.findMemberById(req.params.id);
  if (!member) return renderServerError(res);

  const type = req.body.type || 'Savings';
  const depositRaw = req.body.deposit;
  const deposit = Number(depositRaw);
  const confirmed = req.body.confirmed === 'on';

  let error = null;
  if (fail === 'validation') {
    error = 'Initial deposit must be positive.';
  } else if (!depositRaw || Number.isNaN(deposit) || deposit <= 0) {
    error = 'Initial deposit must be positive.';
  } else if (!confirmed) {
    error = 'You must check "Confirm" before submitting.';
  }

  if (error) {
    return res.render('frame/subaccount-new', {
      member,
      fail: '',
      error,
      values: { type, deposit: depositRaw || '' }
    });
  }

  res.render('frame/subaccount-review', {
    member,
    type,
    deposit,
    fail
  });
});

app.post('/app/member/:id/subaccounts/confirm', requireLogin, (req, res) => {
  const fail = getFail(req);
  if (fail === 'server_error') return renderServerError(res);

  const member = data.findMemberById(req.params.id);
  if (!member) return renderServerError(res);

  const type = req.body.type || 'Savings';
  const deposit = Number(req.body.deposit) || 0;

  const subAccount = data.addSubAccount(member.id, type, deposit);
  res.render('frame/subaccount-confirm', { member, subAccount });
});

app.get('/reset', (req, res) => {
  data.resetData();
  res.render('reset');
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`Mock legacy bank app listening on http://localhost:${PORT}`);
});
