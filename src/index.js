require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const app  = require('./app');
const pool = require('./config/database');

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL 연결 성공');

    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('DB 스키마 초기화 완료');
    }

    app.listen(PORT, () => {
      console.log(`AlgoMovie API 서버 실행 중: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('서버 시작 실패:', err.message);
    process.exit(1);
  }
};

start();
