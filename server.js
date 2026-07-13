require('dotenv').config();

const { connectDb } = require('./config/db');
const { createApp } = require('./app');

async function start() {
  await connectDb(process.env.MONGO_URI);

  const app = createApp();
  const port = process.env.PORT || 5000;

  app.listen(port, () => {
    console.log(`PolicyGate API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
