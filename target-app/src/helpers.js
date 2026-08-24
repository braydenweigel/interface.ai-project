function getFail(req) {
  return (req.query && req.query.fail) || (req.body && req.body.fail) || '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyGlobalDelay(req) {
  const wantsSlow = req.query.slow === 'true' || getFail(req) === 'slow';
  if (wantsSlow) {
    const ms = 2000 + Math.floor(Math.random() * 2000);
    await delay(ms);
  }
}

function renderServerError(res) {
  res.status(500).render('error', { title: 'Internal Server Error' });
}

module.exports = {
  getFail,
  applyGlobalDelay,
  renderServerError
};
