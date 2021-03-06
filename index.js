const express = require('express');
const multer = require('multer');
const axios = require('axios');
const http = require('http');
const sqlite3 = require('sqlite3');
const bluebird = require('bluebird');
const parser = require('fast-xml-parser');

const app = express();
const upload = multer({ dest: 'upload' });
const inst = axios.create({ httpAgent: new http.Agent({ keepAlive: true }) });

function toObject(rows) {
  const res = {};
  for (const {
    hash, clear, perfect, pg, great, gr, maxcombo, combo, minbp, op_history, opt_history,
  } of rows) {
    res[hash] = [
      clear | (op_history || opt_history || 0) & 16,
      ((perfect || pg || 0) << 1) + (great || gr || 0),
      maxcombo || combo || 0,
      minbp,
    ];
  }
  return res;
}

app.post('/', upload.single('db'), async (req, res) => {
  try {
    const db = bluebird.promisifyAll(new sqlite3.Database(req.file.path));
    try {
      const [{ irid, hash }] = await db.allAsync('SELECT irid, hash FROM player');
      const [local, global] = await Promise.all([
        db.allAsync('SELECT * FROM score').then(toObject),
        inst.get(`http://www.dream-pro.info/~lavalse/LR2IR/restorescore.cgi?id=${irid}&passmd5=${hash}`).then(({ data }) => toObject(parser.parse(data).scorelist.score)),
      ]);
      const ret = [];
      for (const bmsmd5 of [...new Set([...Object.keys(local), ...Object.keys(global)])].sort()) {
        const l = local[bmsmd5] || [0, NaN, NaN, NaN];
        const g = global[bmsmd5] || [0, NaN, NaN, NaN];
        if (l.some((e, i) => e !== g[i])) ret.push([bmsmd5, ...l, ...g]);
      }
      res.json(ret);
    } catch (err) {
      console.error(err);
      res.sendStatus(400);
    }
    await db.closeAsync();
  } catch (err) {
    console.error(err);
    res.sendStatus(400);
  }
});
app.use(express.static('public'));

app.listen(8080);
